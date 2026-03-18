"""Send a welcome message when a new user registers."""

from __future__ import annotations

import uuid

from neo4j import AsyncDriver

WELCOME_SUBJECT = "Welcome to Orbis! Here's what you can do with your Orb"

WELCOME_BODY = """\
Hey there! 👋

Welcome to Orbis — your professional identity, reimagined as a living knowledge graph.

Your Orb is more than a CV. Here's what you can do with it:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐  PLUG IT INTO YOUR WEBSITE
Use the MCP tools or the public API to pull your experience, skills, and projects directly into your portfolio site. Your website and your Orb stay in sync — automatically.

🤖  LET AI AGENTS SPEAK FOR YOU
Share your Orb ID and let recruiters' AI assistants query your graph: "What frameworks does this person know?", "Have they led a team?" — without you lifting a finger.

📄  GENERATE A CV ON DEMAND
Hit "Export CV" anytime for a clean PDF. Your Orb is always up to date, so your CV is too.

🔗  SHARE A LIVING LINK
Send an interactive 3D link instead of a static PDF. It's always current and way more memorable.

🧩  CONNECT SKILLS TO EXPERIENCES
Link skills to specific roles and projects — not just "knows Python" but "used Python at Company X to build Y."

📱  QR CODE ON YOUR BUSINESS CARD
Your share panel includes a QR code. Print it and let anyone scan to explore your graph instantly.

🎙️  UPDATE BY VOICE
New certification? Hit the mic, describe it, and Orbis transcribes it into a draft note for review.

🔒  YOU OWN YOUR DATA
End-to-end encryption. You decide what's public and what stays private.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready to get started?
  ➜  Click  ＋ Add  to create your first entry
  ➜  Or upload your existing CV to populate your graph

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
