"""End-to-end assessment pipeline (Phase 5).

Orchestrates the full flow for one assessment:

    ingest (per doc) -> index -> per-requirement LLM assessment
      -> deterministic scoring -> recommendation generation

Manages the ``Assessment`` status lifecycle (PENDING -> PROCESSING ->
COMPLETED/FAILED) and is idempotent: re-running clears prior derived rows first.
Uses the configured LLM provider (deterministic mock by default), so the whole
pipeline runs and is tested offline and reproducibly.
"""
from __future__ import annotations

import logging

from django.utils import timezone

from audit_logs.services import record_action
from common.enums import AssessmentStatus, AuditAction, DocumentStatus
from ingestion.services import ingest_document
from llm.client import LLMClient
from rag.retriever import Retriever
from rag.services import index_document
from recommendations.services import generate_recommendations
from scoring.services import score_and_persist

from .assessor import assess_requirement

logger = logging.getLogger(__name__)


def _prepare_documents(assessment) -> None:
    """Ensure every attached document is ingested and indexed."""
    for doc in assessment.documents.all():
        if doc.status != DocumentStatus.PROCESSED or not doc.extracted_text:
            ingest_document(doc)
        if not doc.chunks.exists():
            index_document(doc)


def run_assessment(assessment, *, client: LLMClient | None = None, retriever: Retriever | None = None):
    """Execute the assessment pipeline. Returns the updated assessment."""
    client = client or LLMClient()
    print("PROVIDER:", client.provider_name)
    retriever = retriever or Retriever()

    assessment.status = AssessmentStatus.PROCESSING
    assessment.started_at = timezone.now()
    assessment.error_message = ""
    assessment.save(update_fields=["status", "started_at", "error_message", "updated_at"])

    try:
        _prepare_documents(assessment)

        documents = list(assessment.documents.all())
        document_ids = [d.id for d in documents]
        source_text = "\n\n".join(d.extracted_text or "" for d in documents)

        # Idempotency: clear prior verdicts/evidence before re-assessing.
        assessment.scores.all().delete()
        assessment.evidence.all().delete()

        requirements = list(assessment.framework.requirements.all())
        for requirement in requirements:
            assess_requirement(
                assessment,
                requirement,
                retriever=retriever,
                client=client,
                source_text=source_text,
                document_ids=document_ids,
            )

        # Deterministic scoring + recommendations.
        report = score_and_persist(assessment)
        recommendations = generate_recommendations(assessment)

        assessment.status = AssessmentStatus.COMPLETED
        assessment.completed_at = timezone.now()
        assessment.config_snapshot = {
            **(assessment.config_snapshot or {}),
            "llm_provider": client.provider_name,
            "requirements_assessed": len(requirements),
        }
        assessment.save()

        record_action(
            AuditAction.PROCESS,
            entity=assessment,
            summary=(
                f"Completed assessment: {report.overall_status} "
                f"({report.overall_score}%), {len(recommendations)} recommendation(s)"
            ),
            metadata={
                "overall_score": str(report.overall_score),
                "risk_level": report.risk_level,
                "provider": client.provider_name,
            },
        )
        logger.info("Assessment %s completed: %s", assessment.id, report.overall_status)
    except Exception as exc:
        assessment.status = AssessmentStatus.FAILED
        assessment.error_message = str(exc)
        assessment.completed_at = timezone.now()
        assessment.save(update_fields=["status", "error_message", "completed_at", "updated_at"])
        record_action(
            AuditAction.PROCESS,
            entity=assessment,
            summary=f"Assessment failed: {exc}",
        )
        logger.exception("Assessment %s failed", assessment.id)
        raise

    return assessment
