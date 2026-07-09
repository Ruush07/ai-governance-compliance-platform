"""Tests for Phase 2 ingestion (real PDF + DOCX extraction)."""
from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile


def _make_pdf(pages: list[str]) -> bytes:
    import fitz

    doc = fitz.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((72, 72), text, fontsize=12)
    data = doc.tobytes()
    doc.close()
    return data


def _make_docx(paragraphs: list[str]) -> bytes:
    import docx

    d = docx.Document()
    for p in paragraphs:
        d.add_paragraph(p)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


@pytest.mark.django_db
def test_extract_text_facade_pdf(tmp_path):
    from ingestion.extract_text import extract_text

    pdf = _make_pdf(["Data governance and provenance records.", "Human oversight procedure."])
    path = tmp_path / "d.pdf"
    path.write_bytes(pdf)

    result = extract_text(str(path), extension="pdf")
    assert result.page_count == 2
    assert "Data governance" in result.pages[0].text
    assert "Human oversight" in result.pages[1].text


@pytest.mark.django_db
def test_ingest_document_pdf_populates_fields():
    from documents.services import create_document
    from ingestion.services import ingest_document

    pdf = _make_pdf(["AI risk management system is documented.", "Logging and record keeping enabled."])
    doc = create_document(SimpleUploadedFile("policy.pdf", pdf, content_type="application/pdf"))

    ingest_document(doc)
    doc.refresh_from_db()

    assert doc.status == "PROCESSED"
    assert doc.page_count == 2
    assert "risk management" in doc.extracted_text
    assert len(doc.page_map) == 2
    # page_map offsets are exact and reversible
    pm = doc.page_map[0]
    assert doc.extracted_text[pm["char_start"]:pm["char_end"]].startswith("AI risk management")
    assert doc.metadata["extractor"] == "pymupdf"


@pytest.mark.django_db
def test_ingest_document_docx():
    from documents.services import create_document
    from ingestion.services import ingest_document

    docx_bytes = _make_docx(["Transparency information for deployers.", "Accuracy and robustness measures."])
    doc = create_document(SimpleUploadedFile("card.docx", docx_bytes))

    ingest_document(doc)
    doc.refresh_from_db()

    assert doc.status == "PROCESSED"
    assert "Transparency information" in doc.extracted_text
    assert doc.metadata["extractor"] == "python-docx"


@pytest.mark.django_db
def test_ingest_writes_audit():
    from audit_logs.models import AuditLog
    from documents.services import create_document
    from ingestion.services import ingest_document

    doc = create_document(SimpleUploadedFile("p.pdf", _make_pdf(["hello world text here"]), content_type="application/pdf"))
    ingest_document(doc)
    assert AuditLog.objects.filter(action="PROCESS", entity_id=str(doc.pk)).exists()


def test_unsupported_extension_raises(tmp_path):
    from ingestion.extract_text import extract_text

    p = tmp_path / "x.csv"
    p.write_text("a,b,c")
    with pytest.raises(ValueError):
        extract_text(str(p), extension="csv")
