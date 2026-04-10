from __future__ import annotations

import base64
import io
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from neo4j import AsyncDriver

from app.dependencies import get_db
from app.graph.encryption import decrypt_properties
from app.graph.queries import GET_FULL_ORB_PUBLIC
from app.orbs.share_token import node_matches_filters, validate_share_token
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export"])


def _gather_orb(record: Any) -> tuple[dict, list[dict]]:
    """Extract person + nodes from a Neo4j record."""
    person = decrypt_properties(dict(record["p"]))
    person.pop("user_id", None)
    person.pop("encryption_key_id", None)

    nodes: list[dict] = []
    for conn in record["connections"]:
        if conn["node"] is None:
            continue
        node = decrypt_properties(dict(conn["node"]))
        node.pop("embedding", None)
        node["_type"] = list(conn["node"].labels)[0]
        node["_relationship"] = conn["rel"]
        nodes.append(node)
    return person, nodes


def _generate_pdf(  # noqa: C901
    person: dict, nodes: list[dict], orb_id: str, include_photo: bool = True
) -> bytes:
    """Build a clean CV PDF from graph data using fpdf2."""
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # ── Profile image ──
    profile_image = person.get("profile_image", "")
    if include_photo and profile_image and profile_image.startswith("data:image/"):
        try:
            header, b64data = profile_image.split(",", 1)
            ext = "png"
            if "jpeg" in header or "jpg" in header:
                ext = "jpg"
            elif "webp" in header:
                ext = "png"  # fpdf2 doesn't support webp natively
            img_bytes = base64.b64decode(b64data)
            img_stream = io.BytesIO(img_bytes)
            pdf.image(img_stream, x=10, y=10, w=25, h=25, type=ext)
            pdf.set_xy(40, 10)
        except Exception:
            pass  # Skip image on error

    # ── Header ──
    pdf.set_font("Helvetica", "B", 22)
    pdf.cell(0, 12, person.get("name", ""), new_x="LMARGIN", new_y="NEXT")
    headline = person.get("headline", "")
    if headline:
        pdf.set_font("Helvetica", "", 12)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 7, headline, new_x="LMARGIN", new_y="NEXT")
    loc = person.get("location", "")
    email = person.get("email", "")
    contact_parts = [p for p in [loc, email] if p]
    if contact_parts:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(0, 6, " | ".join(contact_parts), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(3)
    pdf.set_draw_color(200, 200, 200)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(5)

    # Group nodes by type
    sections: dict[str, list[dict]] = {}
    for n in nodes:
        t = n.get("_type", "Other")
        sections.setdefault(t, []).append(n)

    section_order = [
        ("WorkExperience", "Work Experience"),
        ("Education", "Education"),
        ("Project", "Projects"),
        ("Certification", "Certifications"),
        ("Publication", "Publications"),
        ("Patent", "Patents"),
        ("Award", "Awards"),
        ("Outreach", "Outreach"),
        ("Skill", "Skills"),
        ("Language", "Languages"),
    ]

    for type_key, section_title in section_order:
        items = sections.get(type_key, [])
        if not items:
            continue

        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(90, 60, 180)
        pdf.cell(0, 9, section_title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)
        pdf.ln(1)

        if type_key in ("Skill", "Language"):
            # Compact inline list
            pdf.set_font("Helvetica", "", 10)
            names = []
            for item in items:
                n = item.get("name", "")
                prof = item.get("proficiency", "")
                if prof:
                    names.append(f"{n} ({prof})")
                else:
                    names.append(n)
            pdf.multi_cell(0, 5, ", ".join(names))
            pdf.ln(3)
            continue

        for item in items:
            # Title line
            title = item.get("title") or item.get("name") or ""
            org = (
                item.get("company")
                or item.get("institution")
                or item.get("issuing_organization")
                or item.get("venue")
                or ""
            )

            pdf.set_font("Helvetica", "B", 11)
            if title and org:
                pdf.cell(0, 6, f"{title} - {org}", new_x="LMARGIN", new_y="NEXT")
            elif title:
                pdf.cell(0, 6, title, new_x="LMARGIN", new_y="NEXT")
            elif org:
                pdf.cell(0, 6, org, new_x="LMARGIN", new_y="NEXT")

            # Date line
            dates = []
            for dk in ("start_date", "issue_date", "date"):
                if item.get(dk):
                    dates.append(str(item[dk]))
                    break
            for dk in ("end_date", "expiry_date"):
                if item.get(dk):
                    dates.append(str(item[dk]))
                    break
            location = item.get("location", "")
            meta_parts = []
            if dates:
                meta_parts.append(" - ".join(dates))
            if location:
                meta_parts.append(location)

            if meta_parts:
                pdf.set_font("Helvetica", "", 9)
                pdf.set_text_color(120, 120, 120)
                pdf.cell(0, 5, " | ".join(meta_parts), new_x="LMARGIN", new_y="NEXT")
                pdf.set_text_color(0, 0, 0)

            # Description
            desc = item.get("description") or item.get("abstract") or ""
            if desc:
                pdf.set_font("Helvetica", "", 10)
                pdf.multi_cell(0, 5, str(desc))

            # Role (projects)
            role = item.get("role", "")
            if role and type_key == "Project":
                pdf.set_font("Helvetica", "I", 9)
                pdf.cell(0, 5, f"Role: {role}", new_x="LMARGIN", new_y="NEXT")

            pdf.ln(3)

    # Footer
    pdf.ln(5)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(180, 180, 180)
    pdf.cell(0, 4, f"Generated from Orbis - orbis.io/{orb_id}", align="C")

    return pdf.output()


@router.get("/{orb_id}")
@limiter.limit("30/minute")
async def export_orb(
    request: Request,
    orb_id: str,
    format: str = Query("json", pattern="^(json|jsonld|pdf)$"),
    token: str = Query(..., description="Share token required for access"),
    include_photo: bool = Query(True),
    db: AsyncDriver = Depends(get_db),
):
    # Validate the share token
    token_data = await validate_share_token(db, token)
    if token_data is None:
        raise HTTPException(status_code=403, detail="Invalid or expired share token.")
    if token_data["orb_id"] != orb_id:
        raise HTTPException(
            status_code=403, detail="Token does not grant access to this orb."
        )

    async with db.session() as session:
        try:
            result = await session.run(GET_FULL_ORB_PUBLIC, orb_id=orb_id)
            record = await result.single()
        except Exception as e:
            logger.error(
                "Export DB query failed for orb %s: %s", orb_id, e, exc_info=True
            )
            raise HTTPException(
                status_code=500, detail="Failed to load orb data"
            ) from None
        if record is None:
            raise HTTPException(status_code=404, detail="Orb not found")

    try:
        person, nodes = _gather_orb(record)
    except Exception as e:
        logger.error(
            "Export orb data extraction failed for %s: %s", orb_id, e, exc_info=True
        )
        raise HTTPException(
            status_code=500, detail="Failed to process orb data"
        ) from None

    # Apply keyword filters from the share token
    active_filters = token_data["keywords"]
    if active_filters:
        nodes = [n for n in nodes if not node_matches_filters(n, active_filters)]

    client_ip = request.client.host if request.client else "unknown"
    logger.info("PUBLIC_ACCESS | ip=%s | orb_id=%s | status=200", client_ip, orb_id)

    if format == "pdf":
        try:
            pdf_bytes = _generate_pdf(
                person, nodes, orb_id, include_photo=include_photo
            )
        except Exception as e:
            logger.error(
                "PDF generation failed for orb %s: %s", orb_id, e, exc_info=True
            )
            raise HTTPException(
                status_code=500, detail="Failed to generate PDF"
            ) from None
        filename = f"{person.get('name', orb_id).replace(' ', '_')}_CV.pdf"
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    if format == "jsonld":
        jsonld = {
            "@context": {
                "@vocab": "https://schema.org/",
                "orb": "https://orbis.io/schema/",
            },
            "@type": "Person",
            "@id": f"https://orbis.io/{orb_id}",
            "name": person.get("name", ""),
            "headline": person.get("headline", ""),
            "location": person.get("location", ""),
            "orb:nodes": [],
        }

        type_mapping = {
            "Education": "EducationalOccupationalCredential",
            "WorkExperience": "OrganizationRole",
            "Certification": "EducationalOccupationalCredential",
            "Skill": "DefinedTerm",
            "Publication": "ScholarlyArticle",
            "Project": "Project",
            "Language": "Language",
            "Award": "MonetaryGrant",
            "Outreach": "Event",
        }

        for node in nodes:
            node_type = node.pop("_type", "Thing")
            node.pop("_relationship", None)
            node.pop("uid", None)
            jsonld["orb:nodes"].append(
                {
                    "@type": type_mapping.get(node_type, "Thing"),
                    **{k: v for k, v in node.items() if v and not k.startswith("_")},
                }
            )

        return JSONResponse(content=jsonld, media_type="application/ld+json")

    # Plain JSON
    return {
        "orb_id": orb_id,
        "person": person,
        "nodes": nodes,
    }
