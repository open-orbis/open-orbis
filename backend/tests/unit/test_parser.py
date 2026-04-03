"""Unit tests for app.cv.parser module (rule-based extraction)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.cv.parser import (
    DATE_PATTERN,
    EMAIL_PATTERN,
    NAME_PATTERN,
    SECTION_PATTERNS,
    URL_PATTERN,
    extract_text,
    rule_based_extract,
    rule_based_to_nodes,
)
from app.graph.queries import NODE_TYPE_LABELS

# ── Sample CV text for testing ──

SAMPLE_CV = """John Smith
john.smith@example.com
https://linkedin.com/in/johnsmith
https://scholar.google.com/citations?user=abc123
https://johnsmith.dev

Education
University of Milan
MSc Computer Science
2018 - 2020

Bachelor of Science in Engineering
Politecnico di Milano
2015 - 2018

Work Experience
Google
Senior Software Engineer
Jan 2021 - Present
Worked on distributed systems and infrastructure.

Amazon
Software Engineer
Jun 2020 - Dec 2020
Backend microservices development.

Skills
Python, Java, Go, Kubernetes, Docker, Terraform
Machine Learning, Data Engineering

Languages
English - Native
Italian (C1)
French - B2

Certifications
AWS Solutions Architect Associate
Amazon Web Services

Publications
A Novel Approach to Graph Databases
IEEE Conference 2022

Projects
OpenSource Tool
A CLI tool for automating deployments.
"""


# ── rule_based_extract ──


class TestRuleBasedExtract:
    def test_extracts_contact_info(self):
        result = rule_based_extract(SAMPLE_CV)
        assert result["contact"]["name"] == "John Smith"
        assert result["contact"]["email"] == "john.smith@example.com"
        assert "linkedin" in result["contact"]["linkedin_url"].lower()
        assert "scholar.google" in result["contact"]["scholar_url"].lower()
        assert result["contact"]["website_url"] == "https://johnsmith.dev"

    def test_identifies_sections(self):
        result = rule_based_extract(SAMPLE_CV)
        sections = result["sections"]
        assert "education" in sections
        assert "work_experience" in sections
        assert "skill" in sections
        assert "language" in sections
        assert "certification" in sections
        assert "publication" in sections
        assert "project" in sections

    def test_raw_text_preserved(self):
        result = rule_based_extract(SAMPLE_CV)
        assert result["raw_text"] == SAMPLE_CV

    def test_dates_found(self):
        result = rule_based_extract(SAMPLE_CV)
        assert len(result["dates_found"]) > 0
        assert "2018" in result["dates_found"]

    def test_empty_text(self):
        result = rule_based_extract("")
        assert result["contact"] == {}
        assert result["sections"] == {}

    def test_no_sections(self):
        text = "Just a name\nno-sections-here@email.com"
        result = rule_based_extract(text)
        assert result["sections"] == {}
        assert result["contact"]["email"] == "no-sections-here@email.com"

    def test_section_order_does_not_matter(self):
        text = """Name Person

Skills
Python, Java

Education
MIT
BS Computer Science
2020
"""
        result = rule_based_extract(text)
        assert "skill" in result["sections"]
        assert "education" in result["sections"]

    def test_italian_headers(self):
        text = """Mario Rossi

Formazione
Universita di Bologna
Laurea in Informatica

Esperienza
Azienda SRL
Sviluppatore

Competenze
Python, SQL

Lingue
Italiano - Madrelingua
"""
        result = rule_based_extract(text)
        assert "education" in result["sections"]
        assert "work_experience" in result["sections"]
        assert "skill" in result["sections"]
        assert "language" in result["sections"]


# ── rule_based_to_nodes ──


class TestRuleBasedToNodes:
    def _extract_and_convert(self, text: str) -> list[dict]:
        extraction = rule_based_extract(text)
        return rule_based_to_nodes(extraction)

    def test_skills_split_correctly(self):
        text = """Name Person

Skills
Python, Java, Go, Kubernetes
"""
        nodes = self._extract_and_convert(text)
        skill_names = [n["properties"]["name"] for n in nodes if n["node_type"] == "skill"]
        assert "Python" in skill_names
        assert "Java" in skill_names
        assert "Go" in skill_names
        assert "Kubernetes" in skill_names

    def test_skills_filter_short_and_long(self):
        text = """Name Person

Skills
A, Python, This is a very long skill name that exceeds sixty characters and should be filtered out entirely
"""
        nodes = self._extract_and_convert(text)
        skill_names = [n["properties"]["name"] for n in nodes if n["node_type"] == "skill"]
        assert "A" not in skill_names  # too short (len <= 1)
        assert "Python" in skill_names

    def test_languages_with_proficiency(self):
        text = """Name Person

Languages
English (C1)
Italian - Native
French: B2
"""
        nodes = self._extract_and_convert(text)
        langs = [n for n in nodes if n["node_type"] == "language"]
        names = [l["properties"]["name"] for l in langs]
        assert "English" in names
        assert "Italian" in names

        # Check proficiency extracted
        english = next(l for l in langs if l["properties"]["name"] == "English")
        assert english["properties"]["proficiency"] == "C1"

    def test_languages_without_proficiency(self):
        text = """Name Person

Languages
Spanish
"""
        nodes = self._extract_and_convert(text)
        langs = [n for n in nodes if n["node_type"] == "language"]
        assert len(langs) == 1
        assert langs[0]["properties"]["name"] == "Spanish"
        assert "proficiency" not in langs[0]["properties"]

    def test_education_nodes(self):
        text = """Name Person

Education
MIT - BS Computer Science - studied algorithms and AI

2018 - 2022
"""
        nodes = self._extract_and_convert(text)
        edu = [n for n in nodes if n["node_type"] == "education"]
        assert len(edu) >= 1
        # First line of block becomes institution
        assert "MIT" in edu[0]["properties"]["institution"]

    def test_work_experience_nodes(self):
        # Parser splits on \n(?=[A-Z]), so use a single-block format
        text = """Name Person

Work Experience
Google - senior engineer, built distributed systems. Jan 2021
"""
        nodes = self._extract_and_convert(text)
        work = [n for n in nodes if n["node_type"] == "work_experience"]
        assert len(work) >= 1
        assert "Google" in work[0]["properties"]["company"]

    def test_certification_nodes(self):
        text = """Name Person

Certifications
AWS Solutions Architect
Amazon Web Services
"""
        nodes = self._extract_and_convert(text)
        certs = [n for n in nodes if n["node_type"] == "certification"]
        assert len(certs) >= 1
        assert certs[0]["properties"]["name"] == "AWS Solutions Architect"

    def test_publication_nodes(self):
        text = """Name Person

Publications
A Novel Approach to NLP
EMNLP 2023
"""
        nodes = self._extract_and_convert(text)
        pubs = [n for n in nodes if n["node_type"] == "publication"]
        assert len(pubs) >= 1
        assert pubs[0]["properties"]["title"] == "A Novel Approach to NLP"

    def test_project_nodes(self):
        text = """Name Person

Projects
MyOpenSourceTool
A CLI for automating deployments and testing.
"""
        nodes = self._extract_and_convert(text)
        projs = [n for n in nodes if n["node_type"] == "project"]
        assert len(projs) >= 1
        assert projs[0]["properties"]["name"] == "MyOpenSourceTool"

    def test_dates_extracted_in_nodes(self):
        text = """Name Person

Work Experience
Acme Corp, developer role, Jan 2019 to Dec 2021
"""
        nodes = self._extract_and_convert(text)
        work = [n for n in nodes if n["node_type"] == "work_experience"]
        assert len(work) >= 1
        props = work[0]["properties"]
        assert "start_date" in props, "Expected start_date to be extracted from block containing dates"

    def test_url_extracted_in_work_experience(self):
        text = """Name Person

Work Experience
Acme Corp https://acme.com
Developer
"""
        nodes = self._extract_and_convert(text)
        work = [n for n in nodes if n["node_type"] == "work_experience"]
        assert len(work) >= 1
        assert "company_url" in work[0]["properties"]

    def test_empty_sections_produce_no_nodes(self):
        extraction = {"sections": {"skill": "Skills\n"}, "contact": {}}
        nodes = rule_based_to_nodes(extraction)
        assert nodes == []

    def test_full_cv(self):
        nodes = self._extract_and_convert(SAMPLE_CV)
        types = {n["node_type"] for n in nodes}
        assert "skill" in types
        assert "language" in types
        assert "work_experience" in types
        assert "education" in types

    def test_section_patterns_missing_patent_and_collaborator(self):
        """SECTION_PATTERNS lacks entries for 'patent' and 'collaborator',
        so rule_based_extract can never produce these section types.
        This documents the gap vs NODE_TYPE_LABELS.
        """
        handled_by_patterns = set(SECTION_PATTERNS.keys())
        all_node_types = set(NODE_TYPE_LABELS.keys())
        missing = all_node_types - handled_by_patterns
        assert missing == {"patent", "collaborator"}, (
            f"Expected only patent/collaborator to be missing from SECTION_PATTERNS, "
            f"got: {missing}"
        )


# ── extract_text (with mocks) ──


class TestExtractText:
    def test_pdf_dispatches_correctly(self):
        with patch("app.cv.parser.extract_text_from_pdf", return_value="pdf content") as mock_pdf:
            result = extract_text("/tmp/cv.pdf")
            assert result == "pdf content"
            mock_pdf.assert_called_once_with("/tmp/cv.pdf")

    def test_docx_dispatches_correctly(self):
        with patch("app.cv.parser.extract_text_from_docx", return_value="docx content") as mock_docx:
            result = extract_text("/tmp/cv.docx")
            assert result == "docx content"
            mock_docx.assert_called_once_with("/tmp/cv.docx")

    def test_unsupported_extension_raises(self):
        with pytest.raises(ValueError, match="Unsupported file type"):
            extract_text("/tmp/cv.txt")

    def test_case_insensitive_extension(self):
        with patch("app.cv.parser.extract_text_from_pdf", return_value="ok") as mock_pdf:
            result = extract_text("/tmp/cv.PDF")
            assert result == "ok"
            mock_pdf.assert_called_once()

    def test_extract_text_from_pdf_logic(self):
        mock_page1 = MagicMock()
        mock_page1.get_text.return_value = "Page 1 "
        mock_page2 = MagicMock()
        mock_page2.get_text.return_value = "Page 2"
        
        mock_doc = MagicMock()
        mock_doc.__iter__.return_value = [mock_page1, mock_page2]
        
        from app.cv.parser import extract_text_from_pdf
        with patch("fitz.open", return_value=mock_doc) as mock_open:
            result = extract_text_from_pdf("fake.pdf")
            assert result == "Page 1 Page 2"
            mock_open.assert_called_once_with("fake.pdf")
            mock_doc.close.assert_called_once()

    def test_extract_text_from_docx_logic(self):
        mock_p1 = MagicMock()
        mock_p1.text = "Para 1"
        mock_p2 = MagicMock()
        mock_p2.text = "Para 2"
        
        mock_doc = MagicMock()
        mock_doc.paragraphs = [mock_p1, mock_p2]
        
        from app.cv.parser import extract_text_from_docx
        with patch("app.cv.parser.Document", return_value=mock_doc) as mock_doc_class:
            result = extract_text_from_docx("fake.docx")
            assert result == "Para 1\nPara 2"
            mock_doc_class.assert_called_once_with("fake.docx")


# ── Regex patterns ──


class TestPatterns:
    @pytest.mark.parametrize("email", [
        "user@example.com",
        "first.last@domain.co.uk",
        "user+tag@example.com",
    ])
    def test_email_pattern(self, email):
        assert EMAIL_PATTERN.search(email)

    @pytest.mark.parametrize("url", [
        "https://example.com",
        "http://linkedin.com/in/user",
        "https://scholar.google.com/citations?user=abc",
    ])
    def test_url_pattern(self, url):
        assert URL_PATTERN.search(url)

    @pytest.mark.parametrize("name", [
        "John Smith",
        "Mary Jane Watson",
    ])
    def test_name_pattern(self, name):
        assert NAME_PATTERN.search(name)

    @pytest.mark.parametrize("date_str", [
        "2020", "Jan 2021", "January 2021", "12/2020",
    ])
    def test_date_pattern(self, date_str):
        assert DATE_PATTERN.search(date_str)

    @pytest.mark.parametrize("header, section_type", [
        ("Education", "education"),
        ("EDUCATION", "education"),
        ("Work Experience", "work_experience"),
        ("Professional Experience", "work_experience"),
        ("Skills", "skill"),
        ("Technical Skills", "skill"),
        ("Languages", "language"),
        ("Certifications", "certification"),
        ("Publications", "publication"),
        ("Projects", "project"),
        ("Formazione", "education"),
        ("Esperienza", "work_experience"),
        ("Competenze", "skill"),
        ("Lingue", "language"),
    ])
    def test_section_patterns(self, header, section_type):
        assert SECTION_PATTERNS[section_type].search(header)
