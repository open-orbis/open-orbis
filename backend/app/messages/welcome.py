"""Send a welcome message when a new user registers."""

from __future__ import annotations

import uuid

from neo4j import AsyncDriver

WELCOME_SUBJECT = "Welcome to Orbis! Here's what you can do with your Orb"

WELCOME_BODY = """\
Hey there! 👋

Welcome to Orbis — your professional identity, reimagined as a living knowledge graph.

Your Orb is more than a CV. Here are some things you can do with it:

🌐 Plug it into your personal website
Use the MCP tools or the public API to pull your experience, skills, and projects directly into your portfolio site. No more copy-pasting between your CV and your website — they stay in sync automatically.

🤖 Let AI agents answer questions about you
Share your Orb ID with recruiters or collaborators. Their AI assistants can query your graph directly — "What frameworks does this person know?", "Have they worked in fintech?" — without you lifting a finger.

📄 Generate a CV on demand
Hit "Export CV" anytime to get a clean, structured PDF. Since your Orb is always up to date, your CV is too.

🔗 Share a living link
Your Orb has a permanent shareable link with an interactive 3D view. Send it instead of a static PDF — it's always current and way more memorable.

🧩 Connect skills to experiences
Link your skills to specific roles and projects. This gives recruiters (and AI agents) richer context — not just "knows Python" but "used Python at Company X to build Y."

📱 QR code on your business card
Your Orb's share panel includes a QR code. Print it on your business card so anyone can scan and explore your professional graph instantly.

🎙️ Update by voice
Got a new certification? Just open your Orb, hit the mic, and describe it. Orbis will transcribe and add it to your draft notes for review.

🔒 You own your data
Everything is encrypted end-to-end. You decide what's public and what stays private.

Ready to get started? Click "+ Add" to create your first entry, or upload your existing CV to populate your graph automatically.

Happy orbiting! ✨
— The Orbis Team"""


async def send_welcome_message(db: AsyncDriver, user_id: str) -> None:
    """Create a welcome message for a newly registered user."""
    message_uid = str(uuid.uuid4())
    async with db.session() as session:
        await session.run(
            """
            MATCH (p:Person {user_id: $user_id})
            CREATE (p)-[:HAS_MESSAGE]->(m:Message {
                uid: $uid,
                sender_name: $sender_name,
                sender_email: $sender_email,
                subject: $subject,
                body: $body,
                created_at: datetime(),
                read: false
            })
            RETURN m.uid AS uid
            """,
            user_id=user_id,
            uid=message_uid,
            sender_name="Orbis",
            sender_email="hello@orbis.dev",
            subject=WELCOME_SUBJECT,
            body=WELCOME_BODY,
        )
