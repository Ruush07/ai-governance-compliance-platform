"""Integration test for Phase 4 per-requirement assessment."""
from __future__ import annotations

import pytest


@pytest.mark.django_db
def test_assess_requirement_persists_evidence_and_score(synced_frameworks):
    from assessments.assessor import assess_requirement
    from assessments.models import Assessment
    from documents.models import UploadedDocument
    from frameworks.models import Framework
    from llm.client import LLMClient
    from llm.providers import MockProvider
    from rag.chunker import PageChunker
    from rag.retriever import Retriever
    from rag.services import index_document

    fw = Framework.objects.get(pk="owasp_llm")
    req = fw.requirements.first()

    # Craft a document that echoes the requirement so the deterministic mock
    # finds high evidence coverage.
    text = f"{req.title}. {req.description} " + " ".join(req.evidence_expectations)
    doc = UploadedDocument.objects.create(
        original_filename="d.pdf",
        extension="pdf",
        mime_type="application/pdf",
        size_bytes=len(text),
        sha256="0" * 64,
        extracted_text=text,
        page_map=[{"page": 1, "char_start": 0, "char_end": len(text)}],
        status="PROCESSED",
    )
    index_document(doc, chunker=PageChunker())

    assessment = Assessment.objects.create(framework=fw)
    assessment.documents.add(doc)

    score = assess_requirement(
        assessment,
        req,
        retriever=Retriever(),
        client=LLMClient(provider=MockProvider()),
        source_text=text,
        document_ids=[doc.id],
    )

    assert score.level == "REQUIREMENT"
    assert score.status in {"PASS", "PARTIAL", "FAIL"}
    assert score.requirement_identifier == req.identifier
    # evidence persisted and verified (quote is a verbatim slice of the source)
    assert assessment.evidence.count() >= 1
    assert assessment.evidence.first().verified is True
    assert "needs_review" in score.breakdown
