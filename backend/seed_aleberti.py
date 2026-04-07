"""Seed Neo4j with mock Alessandro Berti data under orb_id 'aleberti'."""

import asyncio
import uuid

from neo4j import AsyncGraphDatabase

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "orbis_dev_password"

TEST_USER_ID = "seed-aleberti"
TEST_ORB_ID = "aleberti"


def uid():
    return str(uuid.uuid4())


async def main():  # noqa: C901
    driver = AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    async with driver.session() as s:
        # Clean up any existing data for this user
        await s.run(
            "MATCH (p:Person {user_id: $uid}) OPTIONAL MATCH (p)-[]->(n) DETACH DELETE n, p",
            uid=TEST_USER_ID,
        )

        # ── Person ──
        await s.run(
            """
            CREATE (p:Person {
                user_id: $user_id,
                orb_id: $orb_id,
                name: 'Alessandro Berti',
                email: 'alessandro.berti1994@gmail.com',
                headline: 'Postdoc Researcher in Quantum Computing @ University of Pisa',
                location: 'Pisa, Italy',
                linkedin_url: '',
                scholar_url: 'https://scholar.google.com/citations?user=o6wy2g0AAAAJ&hl=en',
                website_url: '',
                orcid_url: 'https://orcid.org/0000-0001-9144-9572',
                open_to_work: false,
                created_at: datetime(),
                updated_at: datetime()
            })
        """,
            user_id=TEST_USER_ID,
            orb_id=TEST_ORB_ID,
        )

        # ── Helper to create nodes ──
        async def add_node(label, rel_type, props):
            node_uid = uid()
            query = f"""
                MATCH (p:Person {{user_id: $user_id}})
                CREATE (p)-[:{rel_type}]->(n:{label} $props)
                SET n.uid = $uid
                RETURN n
            """
            await s.run(query, user_id=TEST_USER_ID, props=props, uid=node_uid)
            return node_uid

        # ══════════════════════════════════════
        # EDUCATION
        # ══════════════════════════════════════
        edu1 = await add_node(
            "Education",
            "HAS_EDUCATION",
            {
                "institution": "Universita di Pisa",
                "degree": "Dottorato di Ricerca in Informatica (PhD)",
                "description": "Thesis: Effectiveness of Quantum Algorithms: From Compilation to Measurement. Supervisors: Anna Bernasconi, Gianna Maria Del Corso, Riccardo Guidotti. Grade: Ottimo.",
                "start_date": "11/2020",
                "end_date": "05/2024",
            },
        )

        edu2 = await add_node(
            "Education",
            "HAS_EDUCATION",
            {
                "institution": "Universita di Pisa",
                "degree": "Laurea Magistrale in Informatica (LM-18)",
                "description": "Thesis: A Fully Distributed IoT Layer using Blockchain & IPFS with Case Study and Formal Analysis. Grade: 110/110 e lode.",
                "start_date": "09/2017",
                "end_date": "06/2020",
            },
        )

        edu3 = await add_node(
            "Education",
            "HAS_EDUCATION",
            {
                "institution": "Universita di Pisa",
                "degree": "Laurea Triennale in Informatica (L-31)",
                "description": "Thesis: Sviluppo di un plugin per visualizzazione ed analisi della blockchain di Bitcoin. Grade: 100/110.",
                "start_date": "09/2013",
                "end_date": "12/2017",
            },
        )

        # ══════════════════════════════════════
        # WORK EXPERIENCE
        # ══════════════════════════════════════
        we1 = await add_node(
            "WorkExperience",
            "HAS_WORK_EXPERIENCE",
            {
                "company": "Universita di Pisa - Dipartimento di Fisica",
                "title": "Assegnista di Ricerca (Postdoc Researcher)",
                "description": "Quantum algorithms for Machine Learning. Research on quantum subroutines for matrix/activation functions in quantum ML.",
                "start_date": "04/2024",
                "end_date": "present",
            },
        )

        we2 = await add_node(
            "WorkExperience",
            "HAS_WORK_EXPERIENCE",
            {
                "company": "Universita di Pisa - Dipartimento di Informatica",
                "title": "Cultore della Materia in Computazione Quantistica",
                "description": "Teaching support and examination role in Quantum Computing courses.",
                "start_date": "09/2024",
                "end_date": "present",
            },
        )

        we3 = await add_node(
            "WorkExperience",
            "HAS_WORK_EXPERIENCE",
            {
                "company": "SQMS Center - Fermilab",
                "title": "Visiting PhD Student",
                "description": "Design and implementation of a quantum reservoir computing model for learning noise-resilient quantum gates on superconductor architectures.",
                "start_date": "08/2022",
                "end_date": "01/2023",
            },
        )

        we4 = await add_node(
            "WorkExperience",
            "HAS_WORK_EXPERIENCE",
            {
                "company": "Universita di Pisa - Dipartimento di Informatica",
                "title": "Dottorando (PhD Student)",
                "description": "Research on quantum algorithms effectiveness, from compilation to measurement. Published 24+ papers.",
                "start_date": "11/2020",
                "end_date": "05/2024",
            },
        )

        we5 = await add_node(
            "WorkExperience",
            "HAS_WORK_EXPERIENCE",
            {
                "company": "Cinello",
                "title": "Consulente Tecnico (Technical Consultant)",
                "description": "Blockchain training sessions for R&D team. Supervised development of an Ethereum ERC-721 smart contract for digital art tokenization.",
                "start_date": "10/2020",
                "end_date": "10/2020",
            },
        )

        we6 = await add_node(
            "WorkExperience",
            "HAS_WORK_EXPERIENCE",
            {
                "company": "IBM Quantum",
                "title": "Qiskit Advocate",
                "description": "Recognized by IBM Quantum for deep knowledge of quantum algorithms and circuits, contributing to the Qiskit Global Community.",
                "start_date": "10/2023",
                "end_date": "present",
            },
        )

        await add_node(
            "WorkExperience",
            "HAS_WORK_EXPERIENCE",
            {
                "company": "Superhero Valley",
                "title": "Fondatore & Head of Mentorship",
                "description": "Founded an Italian community connecting university students with Big Tech. 2300+ members from 8+ universities. Manages mentorship program and corporate relations.",
                "start_date": "11/2020",
                "end_date": "09/2025",
            },
        )

        we8 = await add_node(
            "WorkExperience",
            "HAS_WORK_EXPERIENCE",
            {
                "company": "Tocket",
                "title": "Chief Technology Officer",
                "description": "Startup to eliminate ticket scalping at live events. Built payment system with Stripe API, Ethereum smart contracts, Flutter mobile app for Android and iOS.",
                "start_date": "09/2019",
                "end_date": "09/2020",
            },
        )

        await add_node(
            "WorkExperience",
            "HAS_WORK_EXPERIENCE",
            {
                "company": "PointerPodcast",
                "title": "Co-Host",
                "description": "Weekly podcast on research and tech innovation. 230+ episodes. Interviewed experts from NASA, IBM, INFN, Fermilab/SQMS.",
                "start_date": "05/2019",
                "end_date": "present",
            },
        )

        # ══════════════════════════════════════
        # SKILLS
        # ══════════════════════════════════════
        skill_ids = {}
        skills = [
            "Quantum Computing",
            "Quantum Algorithms",
            "Quantum Machine Learning",
            "Quantum State Preparation",
            "Variational Quantum Algorithms",
            "Qiskit",
            "Pennylane",
            "Python",
            "Java",
            "C",
            "C++",
            "Blockchain",
            "Ethereum",
            "Smart Contracts",
            "Flutter",
            "Dart",
            "Machine Learning",
            "Data Science",
            "Neo4j",
            "Graph Algorithms",
            "Scientific Writing",
            "Jupyter",
            "Claude Code",
            "Roo Code",
            "Adobe Premiere",
            "Adobe After Effects",
            "3D Modeling",
        ]
        for skill_name in skills:
            sid = await add_node("Skill", "HAS_SKILL", {"name": skill_name})
            skill_ids[skill_name] = sid

        # ══════════════════════════════════════
        # USED_SKILL cross-links
        # ══════════════════════════════════════
        async def link_skill(node_uid, skill_name):
            if skill_name in skill_ids:
                await s.run(
                    "MATCH (n {uid: $nuid}), (sk:Skill {uid: $suid}) MERGE (n)-[:USED_SKILL]->(sk)",
                    nuid=node_uid,
                    suid=skill_ids[skill_name],
                )

        # Education -> Skills
        for sk in ["Quantum Computing", "Quantum Algorithms", "Python", "Qiskit"]:
            await link_skill(edu1, sk)
        for sk in ["Blockchain", "Ethereum"]:
            await link_skill(edu2, sk)
            await link_skill(edu3, sk)

        # Work -> Skills
        for sk in [
            "Quantum Machine Learning",
            "Quantum Algorithms",
            "Python",
            "Qiskit",
            "Pennylane",
        ]:
            await link_skill(we1, sk)
        for sk in ["Quantum Computing"]:
            await link_skill(we2, sk)
        for sk in ["Quantum Computing", "Quantum Machine Learning", "Python", "Qiskit"]:
            await link_skill(we3, sk)
        for sk in [
            "Quantum Algorithms",
            "Quantum State Preparation",
            "Python",
            "Scientific Writing",
        ]:
            await link_skill(we4, sk)
        for sk in ["Blockchain", "Ethereum", "Smart Contracts"]:
            await link_skill(we5, sk)
        for sk in ["Qiskit", "Quantum Computing"]:
            await link_skill(we6, sk)
        for sk in ["Blockchain", "Flutter", "Dart", "Ethereum", "Smart Contracts"]:
            await link_skill(we8, sk)

        # ══════════════════════════════════════
        # CERTIFICATIONS
        # ══════════════════════════════════════
        await add_node(
            "Certification",
            "HAS_CERTIFICATION",
            {
                "name": "Qiskit Fall Fest Mentor",
                "issuing_organization": "IBM",
                "date": "12/2024",
            },
        )
        await add_node(
            "Certification",
            "HAS_CERTIFICATION",
            {
                "name": "Qiskit Advocate Certification",
                "issuing_organization": "IBM",
                "date": "10/2023",
            },
        )
        await add_node(
            "Certification",
            "HAS_CERTIFICATION",
            {
                "name": "IBM Certified Associate Developer - Quantum Computation using Qiskit v0.2X",
                "issuing_organization": "IBM Professional Certification",
                "date": "07/2023",
            },
        )
        await add_node(
            "Certification",
            "HAS_CERTIFICATION",
            {
                "name": "IBM Blockchain Foundation Developer",
                "issuing_organization": "IBM",
                "date": "12/2019",
            },
        )
        await add_node(
            "Certification",
            "HAS_CERTIFICATION",
            {
                "name": "Data Science for Business",
                "issuing_organization": "IBM",
                "date": "12/2019",
            },
        )

        # ══════════════════════════════════════
        # LANGUAGES
        # ══════════════════════════════════════
        await add_node(
            "Language",
            "SPEAKS",
            {
                "name": "Italiano",
                "proficiency": "Madrelingua (Native)",
            },
        )
        await add_node(
            "Language",
            "SPEAKS",
            {
                "name": "English",
                "proficiency": "Avanzato (C1)",
            },
        )

        # ══════════════════════════════════════
        # PUBLICATIONS (selected key ones)
        # ══════════════════════════════════════
        pub1 = await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "Quantum subroutine for variance estimation: algorithmic design and applications",
                "venue": "Quantum Machine Intelligence 6.2 (2024)",
                "description": "Journal paper on quantum subroutines for variance estimation.",
            },
        )
        pub2 = await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "Quantum Subroutine for Efficient Matrix Multiplication",
                "venue": "IEEE Access (2024)",
                "description": "Journal paper on efficient quantum matrix multiplication subroutines.",
            },
        )
        pub3 = await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "The role of encodings and distance metrics for the quantum nearest neighbor",
                "venue": "Quantum Machine Intelligence 6.2 (2024)",
                "description": "Study of encoding and distance function effects on quantum classifiers.",
            },
        )
        pub4 = await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "Quantum clustering with k-Means: A hybrid approach",
                "venue": "Theoretical Computer Science 992 (2024)",
                "description": "Hybrid quantum-classical approach to k-means clustering.",
            },
        )
        await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "XOR-AND-XOR Logic Forms for Autosymmetric Functions and Applications to Quantum Computing",
                "venue": "IEEE Transactions on Computer-Aided Design of Integrated Circuits and Systems 42.6 (2023)",
                "description": "Logic optimization techniques applied to quantum circuit design.",
            },
        )
        await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "Logarithmic Quantum Forking",
                "venue": "Proceedings of ESANN (2023)",
                "description": "Novel technique for logarithmic quantum state forking.",
            },
        )
        await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "Effect of Different Encodings and Distance Functions on Quantum Instance-Based Classifiers",
                "venue": "PAKDD 2022, Springer",
                "description": "Conference paper on quantum instance-based classification methods.",
            },
        )
        pub8 = await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "Variational Compression of Circuits for State Preparation",
                "venue": "IEEE QCE 2024",
                "description": "Variational circuits for compressing quantum state preparation.",
            },
        )
        await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "Quantum Reservoir Computing Approach to Error-Mitigated Compilation",
                "venue": "QTML Workshop (2023)",
                "description": "Reservoir computing for noise-resilient quantum gate learning.",
            },
        )
        await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "Outlier Detection and other applications of Quantum Matrix Multiplication",
                "venue": "IEEE IPDPSW 2025",
                "description": "Applications of quantum matrix multiplication to outlier detection.",
            },
        )
        await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "Variational Decision Trees with Structured Ansatzes",
                "venue": "IEEE QCE 2025",
                "description": "Variational quantum decision trees with structured circuit ansatzes.",
            },
        )
        await add_node(
            "Publication",
            "HAS_PUBLICATION",
            {
                "title": "Efficient quantum state preparation with Bucket Brigade QRAM",
                "venue": "Under Revision",
                "description": "Efficient quantum state preparation using bucket brigade QRAM architecture.",
            },
        )

        # Publication -> Skill links
        for pub in [pub1, pub2, pub3, pub4, pub8]:
            await link_skill(pub, "Quantum Algorithms")
            await link_skill(pub, "Python")
        for pub in [pub1, pub3, pub4]:
            await link_skill(pub, "Quantum Machine Learning")
        await link_skill(pub8, "Variational Quantum Algorithms")

        # ══════════════════════════════════════
        # PROJECTS
        # ══════════════════════════════════════
        proj1 = await add_node(
            "Project",
            "HAS_PROJECT",
            {
                "name": "GNCS Research Project - Quantum Subroutines (PI)",
                "description": "Coordinator of research project on quantum subroutines for matrix/activation functions in quantum ML. Istituto Nazionale di Alta Matematica (2025-2026).",
            },
        )
        proj2 = await add_node(
            "Project",
            "HAS_PROJECT",
            {
                "name": "PNRR CN1 - HPC, Big Data and Quantum Computing",
                "description": "National research project at Politecnico di Milano. Study of quantum ML techniques for state preparation and quantum AI subroutines (2024-ongoing).",
            },
        )
        proj3 = await add_node(
            "Project",
            "HAS_PROJECT",
            {
                "name": "SoBigData++ (H2020)",
                "description": "European project for Social Mining & Big Data Ecosystem. Produced PyPI package for quantum k-Nearest Neighbors (2020-2024).",
            },
        )
        proj4 = await add_node(
            "Project",
            "HAS_PROJECT",
            {
                "name": "PRA-Quantum Computing",
                "description": "University of Pisa research project on quantum computing technologies and applications (2020-2022).",
            },
        )
        await add_node(
            "Project",
            "HAS_PROJECT",
            {
                "name": "Quantum Festival & Pisa Quantum Festival",
                "description": "Co-organized quantum computing festivals in Pisa with 400+ participants, featuring speakers from academia and industry (2024-2025).",
            },
        )

        for proj in [proj1, proj2, proj3, proj4]:
            await link_skill(proj, "Quantum Algorithms")
            await link_skill(proj, "Python")
        await link_skill(proj1, "Pennylane")
        await link_skill(proj1, "Qiskit")
        await link_skill(proj3, "Machine Learning")

        # ══════════════════════════════════════
        # PATENT
        # ══════════════════════════════════════
        patent1 = await add_node(
            "Patent",
            "HAS_PATENT",
            {
                "name": "Circuito quantistico per forking di uno stato quantistico",
                "description": "Quantum circuit for forking a quantum state. Patent ID: IT202200024873A1. Filed 12/2022, granted 11/2024. Applicant: Universita di Pisa.",
            },
        )
        await link_skill(patent1, "Quantum Algorithms")
        await link_skill(patent1, "Quantum State Preparation")

        # ══════════════════════════════════════
        # COLLABORATORS
        # ══════════════════════════════════════
        await add_node(
            "Collaborator",
            "COLLABORATED_WITH",
            {
                "name": "Davide Venturelli",
                "description": "USRA Research Institute, Quantum AI Laboratory at NASA ARC",
            },
        )
        await add_node(
            "Collaborator",
            "COLLABORATED_WITH",
            {
                "name": "Nishchay Suri",
                "description": "Associate Scientist, NASA and USRA Quantum AI Lab",
            },
        )
        await add_node(
            "Collaborator",
            "COLLABORATED_WITH",
            {
                "name": "Silvia Zorzetti",
                "description": "Principal Engineer and Department Head, Fermilab/SQMS",
            },
        )
        await add_node(
            "Collaborator",
            "COLLABORATED_WITH",
            {
                "name": "Anna Bernasconi",
                "description": "Professor, Universita di Pisa - PhD Supervisor",
            },
        )
        await add_node(
            "Collaborator",
            "COLLABORATED_WITH",
            {
                "name": "Gianna Maria Del Corso",
                "description": "Professor, Universita di Pisa - PhD Supervisor",
            },
        )
        await add_node(
            "Collaborator",
            "COLLABORATED_WITH",
            {
                "name": "Riccardo Guidotti",
                "description": "Professor, Universita di Pisa - PhD Supervisor",
            },
        )

        # ══════════════════════════════════════
        # AWARDS
        # ══════════════════════════════════════
        award1 = await add_node(
            "Award",
            "HAS_AWARD",
            {
                "name": "Best Paper Award - IEEE QCE 2024",
                "issuing_organization": "IEEE Quantum Week",
                "date": "09/2024",
                "description": "Awarded for the paper on Variational Compression of Circuits for State Preparation.",
            },
        )
        await link_skill(award1, "Quantum Algorithms")
        await link_skill(award1, "Variational Quantum Algorithms")

        await add_node(
            "Award",
            "HAS_AWARD",
            {
                "name": "GNCS Young Researcher Grant",
                "issuing_organization": "Istituto Nazionale di Alta Matematica (INdAM)",
                "date": "01/2025",
                "description": "Competitive grant for coordinating a research project on quantum subroutines for ML.",
            },
        )

        # ══════════════════════════════════════
        # OUTREACH
        # ══════════════════════════════════════
        out1 = await add_node(
            "Outreach",
            "HAS_OUTREACH",
            {
                "title": "Pisa Quantum Festival 2024",
                "type": "event",
                "venue": "Pisa, Italy",
                "date": "05/2024",
                "role": "Organizer",
                "description": "Co-organized quantum computing festival with 400+ participants, speakers from academia and industry.",
            },
        )
        await link_skill(out1, "Quantum Computing")

        out2 = await add_node(
            "Outreach",
            "HAS_OUTREACH",
            {
                "title": "Invited Talk: Quantum ML Subroutines",
                "type": "talk",
                "venue": "SQMS Center, Fermilab",
                "date": "01/2023",
                "role": "Speaker",
                "description": "Presented research on quantum reservoir computing for noise-resilient gate learning.",
            },
        )
        await link_skill(out2, "Quantum Machine Learning")
        await link_skill(out2, "Qiskit")

        await add_node(
            "Outreach",
            "HAS_OUTREACH",
            {
                "title": "PointerPodcast - Weekly Episodes",
                "type": "podcast",
                "venue": "Online",
                "date": "05/2019",
                "role": "Host",
                "description": "Co-host of weekly podcast on research and tech innovation. 230+ episodes with experts from NASA, IBM, INFN, Fermilab.",
            },
        )

    await driver.close()
    print("Knowledge graph seeded successfully!")
    print(f"  User ID:  {TEST_USER_ID}")
    print(f"  Orb ID:   {TEST_ORB_ID}")
    print(f"  View at:  http://localhost:5173/orb/{TEST_ORB_ID}")


if __name__ == "__main__":
    asyncio.run(main())
