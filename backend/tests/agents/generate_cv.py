#!/usr/bin/env python3
"""Generate realistic synthetic CV PDFs for agent-based UX evaluation.

Usage:
    python generate_cv.py --seed 42 --output /tmp/cv_42.pdf
    python generate_cv.py --name "Mario Rossi" --seed 1 --output /tmp/mario.pdf

The generated PDF is text-extractable (PyMuPDF compatible) and passes the
backend's %PDF- magic-byte validation.
"""

from __future__ import annotations

import argparse
import random
from dataclasses import dataclass, field
from pathlib import Path

from fpdf import FPDF

# ── Data pools ──────────────────────────────────────────────────────────

FIRST_NAMES = [
    "Marco",
    "Giulia",
    "Luca",
    "Sara",
    "Alessandro",
    "Francesca",
    "Andrea",
    "Elena",
    "Matteo",
    "Chiara",
    "Sofia",
    "Lorenzo",
    "Anna",
    "Davide",
    "Valentina",
    "Federico",
    "Laura",
    "Simone",
    "Martina",
    "Tommaso",
]

LAST_NAMES = [
    "Rossi",
    "Bianchi",
    "Ferrari",
    "Esposito",
    "Romano",
    "Colombo",
    "Ricci",
    "Marino",
    "Greco",
    "Bruno",
    "Gallo",
    "Conti",
    "De Luca",
    "Mancini",
    "Costa",
    "Giordano",
    "Rizzo",
    "Lombardi",
    "Moretti",
    "Barbieri",
]

CITIES = [
    "Milano, Italy",
    "Roma, Italy",
    "Torino, Italy",
    "Firenze, Italy",
    "Bologna, Italy",
    "Napoli, Italy",
    "Padova, Italy",
    "Berlin, Germany",
    "London, UK",
    "Amsterdam, Netherlands",
    "Barcelona, Spain",
    "Paris, France",
    "Zurich, Switzerland",
    "Vienna, Austria",
    "Dublin, Ireland",
]

HEADLINES = [
    "Software Engineer",
    "Data Scientist",
    "Product Manager",
    "UX Designer",
    "Full-Stack Developer",
    "Machine Learning Engineer",
    "DevOps Engineer",
    "Backend Developer",
    "Frontend Developer",
    "Cloud Architect",
    "Research Scientist",
    "Engineering Manager",
    "Technical Lead",
    "Solutions Architect",
    "Data Engineer",
]

COMPANIES = [
    "Accenture",
    "Reply S.p.A.",
    "Deloitte",
    "Engineering Ingegneria",
    "Fineco",
    "Bending Spoons",
    "Satispay",
    "Nexi",
    "UniCredit",
    "Enel",
    "TechCorp",
    "DataStream",
    "CloudWorks",
    "AI Solutions",
    "Digital Factory",
    "InfoSys",
    "Capgemini",
    "Sopra Steria",
    "Avanade",
    "NTT Data",
]

JOB_TITLES = [
    "Software Engineer",
    "Senior Software Engineer",
    "Junior Developer",
    "Data Analyst",
    "Product Owner",
    "Scrum Master",
    "DevOps Engineer",
    "QA Engineer",
    "Tech Lead",
    "System Administrator",
    "Database Administrator",
    "Frontend Developer",
    "Backend Developer",
    "Full-Stack Developer",
    "ML Engineer",
    "Cloud Engineer",
    "Solutions Architect",
    "Business Analyst",
    "Project Manager",
    "UX Researcher",
]

UNIVERSITIES = [
    "Politecnico di Milano",
    "Universita Bocconi",
    "Universita di Bologna",
    "Sapienza Universita di Roma",
    "Politecnico di Torino",
    "Universita di Padova",
    "Universita di Firenze",
    "Universita Federico II",
    "ETH Zurich",
    "TU Munich",
    "Imperial College London",
    "KU Leuven",
]

DEGREES = [
    "BSc Computer Science",
    "MSc Computer Engineering",
    "BSc Information Engineering",
    "MSc Data Science",
    "BSc Mathematics",
    "MSc Artificial Intelligence",
    "BSc Economics",
    "MSc Management Engineering",
    "PhD Computer Science",
    "BSc Electronic Engineering",
]

SKILLS = [
    "Python",
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "SQL",
    "PostgreSQL",
    "Docker",
    "Kubernetes",
    "AWS",
    "GCP",
    "Azure",
    "Git",
    "CI/CD",
    "REST APIs",
    "GraphQL",
    "TensorFlow",
    "PyTorch",
    "Pandas",
    "Scikit-learn",
    "Java",
    "Go",
    "Rust",
    "C++",
    "Redis",
    "MongoDB",
    "Neo4j",
    "Kafka",
    "Terraform",
    "Linux",
    "Agile",
    "Scrum",
    "Machine Learning",
    "Deep Learning",
    "NLP",
    "Computer Vision",
    "FastAPI",
    "Django",
    "Spring Boot",
    "Figma",
]

CERTIFICATIONS = [
    "AWS Solutions Architect Associate",
    "Google Cloud Professional Data Engineer",
    "Certified Kubernetes Administrator",
    "PMP Project Management Professional",
    "Scrum Master PSM I",
    "Azure Fundamentals AZ-900",
    "Terraform Associate",
    "CKAD Certified Kubernetes Application Developer",
]

LANGUAGES = [
    ("Italian", "Native"),
    ("English", "Fluent"),
    ("French", "Intermediate"),
    ("German", "Intermediate"),
    ("Spanish", "Basic"),
    ("Portuguese", "Basic"),
    ("Chinese", "Basic"),
    ("Japanese", "Basic"),
]

TASK_DESCRIPTIONS = [
    "Designed and implemented RESTful APIs serving 10K+ requests per day",
    "Led migration of monolithic application to microservices architecture",
    "Built real-time data pipeline processing 1M+ events daily",
    "Developed machine learning models achieving 95% accuracy on production data",
    "Implemented CI/CD pipelines reducing deployment time by 60%",
    "Optimized database queries reducing response time by 40%",
    "Mentored junior developers and conducted code reviews",
    "Collaborated with cross-functional teams to deliver features on schedule",
    "Developed frontend components using React and TypeScript",
    "Managed cloud infrastructure on AWS/GCP for high-availability systems",
    "Conducted A/B testing and data analysis to drive product decisions",
    "Designed and maintained automated testing frameworks",
    "Architected event-driven systems using Kafka and RabbitMQ",
    "Implemented security best practices including OAuth2 and encryption",
    "Built dashboards and monitoring systems using Grafana and Prometheus",
]


# ── Persona model ───────────────────────────────────────────────────────


@dataclass
class WorkExperience:
    title: str
    company: str
    start_year: int
    end_year: int | None  # None = present
    descriptions: list[str] = field(default_factory=list)


@dataclass
class Education:
    degree: str
    institution: str
    start_year: int
    end_year: int


@dataclass
class Persona:
    name: str
    email: str
    headline: str
    location: str
    skills: list[str]
    work_experiences: list[WorkExperience]
    education: list[Education]
    certifications: list[str]
    languages: list[tuple[str, str]]


def generate_persona(seed: int | None = None, name: str | None = None) -> Persona:
    """Generate a randomized but internally consistent persona."""
    rng = random.Random(seed)

    if name:
        parts = name.split()
        first = parts[0]
        last = parts[-1] if len(parts) > 1 else rng.choice(LAST_NAMES)
    else:
        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)

    full_name = f"{first} {last}"
    email = f"{first.lower()}.{last.lower()}@example.com"

    # Work experiences (2-5), chronologically ordered
    num_exp = rng.randint(2, 5)
    current_year = 2026
    experiences = []
    year = current_year
    for i in range(num_exp):
        duration = rng.randint(1, 4)
        end = None if i == 0 else year
        start = (year if i == 0 else year) - duration
        experiences.append(
            WorkExperience(
                title=rng.choice(JOB_TITLES),
                company=rng.choice(COMPANIES),
                start_year=start,
                end_year=end,
                descriptions=rng.sample(TASK_DESCRIPTIONS, k=rng.randint(2, 4)),
            )
        )
        year = start - rng.randint(0, 1)

    # Education (1-3)
    num_edu = rng.randint(1, 3)
    edu = []
    edu_year = year
    for _ in range(num_edu):
        duration = rng.randint(2, 5)
        edu.append(
            Education(
                degree=rng.choice(DEGREES),
                institution=rng.choice(UNIVERSITIES),
                start_year=edu_year - duration,
                end_year=edu_year,
            )
        )
        edu_year = edu_year - duration - rng.randint(0, 1)

    return Persona(
        name=full_name,
        email=email,
        headline=rng.choice(HEADLINES),
        location=rng.choice(CITIES),
        skills=rng.sample(SKILLS, k=rng.randint(5, 15)),
        work_experiences=experiences,
        education=edu,
        certifications=rng.sample(CERTIFICATIONS, k=rng.randint(0, 3)),
        languages=rng.sample(LANGUAGES, k=rng.randint(1, 4)),
    )


# ── PDF generation ──────────────────────────────────────────────────────


class CvPdf(FPDF):
    def header(self):
        pass

    def section_title(self, title: str):
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(40, 40, 40)
        self.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(100, 100, 100)
        self.line(self.l_margin, self.get_y(), 190, self.get_y())
        self.ln(3)

    def body_text(self, text: str, bold: bool = False):
        style = "B" if bold else ""
        self.set_font("Helvetica", style, 10)
        self.set_text_color(60, 60, 60)
        self.multi_cell(0, 5, text, new_x="LMARGIN", new_y="NEXT")


def generate_cv_pdf(persona: Persona) -> bytes:
    """Generate a realistic, text-extractable PDF CV."""
    pdf = CvPdf()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Header — name
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 12, persona.name, new_x="LMARGIN", new_y="NEXT", align="C")

    # Headline + contact
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(
        0,
        7,
        f"{persona.headline} | {persona.location}",
        new_x="LMARGIN",
        new_y="NEXT",
        align="C",
    )
    pdf.cell(
        0,
        7,
        persona.email,
        new_x="LMARGIN",
        new_y="NEXT",
        align="C",
    )
    pdf.ln(6)

    # Work Experience
    pdf.section_title("Work Experience")
    for exp in persona.work_experiences:
        end = "Present" if exp.end_year is None else str(exp.end_year)
        pdf.body_text(f"{exp.title} at {exp.company}", bold=True)
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(
            0,
            5,
            f"{exp.start_year} - {end}",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(60, 60, 60)
        for desc in exp.descriptions:
            pdf.multi_cell(0, 5, f"  - {desc}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # Education
    pdf.section_title("Education")
    for edu in persona.education:
        pdf.body_text(f"{edu.degree}", bold=True)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(
            0,
            5,
            f"{edu.institution}, {edu.start_year} - {edu.end_year}",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(3)

    # Skills
    pdf.section_title("Skills")
    pdf.body_text(", ".join(persona.skills))
    pdf.ln(3)

    # Certifications
    if persona.certifications:
        pdf.section_title("Certifications")
        for cert in persona.certifications:
            pdf.body_text(f"- {cert}")
        pdf.ln(3)

    # Languages
    pdf.section_title("Languages")
    for lang, level in persona.languages:
        pdf.body_text(f"- {lang}: {level}")

    return pdf.output()


# ── CLI ─────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Generate a synthetic CV PDF for UX evaluation."
    )
    parser.add_argument(
        "--name",
        help="Full name (random if omitted)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for reproducibility",
    )
    parser.add_argument(
        "--output",
        "-o",
        required=True,
        help="Output PDF path",
    )
    args = parser.parse_args()

    persona = generate_persona(seed=args.seed, name=args.name)
    pdf_bytes = generate_cv_pdf(persona)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(pdf_bytes)

    print(f"Generated CV for {persona.name} ({persona.headline})")
    print(f"  Email:    {persona.email}")
    print(f"  Location: {persona.location}")
    print(f"  Skills:   {len(persona.skills)}")
    print(f"  Experience: {len(persona.work_experiences)} roles")
    print(f"  Education:  {len(persona.education)} entries")
    print(f"  Output:   {out}")


if __name__ == "__main__":
    main()
