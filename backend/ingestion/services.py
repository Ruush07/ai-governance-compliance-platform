"""Ingestion orchestration (Phase 2 implementation).

Extracts text (with OCR fallback), records page structure + metadata onto the
``UploadedDocument``, and manages its status lifecycle. The RAG indexing step
(Phase 3) consumes ``extracted_text`` + ``page_map`` produced here.
"""
from __future__ import annotations

import logging

from django.utils import timezone

from audit_logs.services import record_action
from common.enums import AuditAction, DocumentStatus

from .extract_text import extract_text

logger = logging.getLogger(__name__)


def ingest_document(document) -> "document":
    """Extract and persist the text/structure of a single ``UploadedDocument``.

    Idempotent: re-running re-extracts and overwrites. On failure the document
    is marked FAILED with the error message (the exception is re-raised so the
    orchestrator can decide how to proceed).
    """
    document.status = DocumentStatus.PROCESSING
    document.save(update_fields=["status", "updated_at"])

    try:
        extracted = extract_text(document.file.path, extension=document.extension)
    except Exception as exc:
        document.status = DocumentStatus.FAILED
        document.error_message = f"Ingestion failed: {exc}"
        document.save(update_fields=["status", "error_message", "updated_at"])
        logger.exception("Ingestion failed for document %s", document.id)
        raise

    document.extracted_text = extracted.full_text
    document.page_map = extracted.build_page_map()
    document.page_count = extracted.page_count
    document.is_scanned = any(p.is_scanned for p in extracted.pages)
    document.metadata = {
        **(document.metadata or {}),
        **extracted.metadata,
        "char_count": len(extracted.full_text),
        "ingested_at": timezone.now().isoformat(),
    }
    document.status = DocumentStatus.PROCESSED
    document.error_message = ""
    document.save()

    record_action(
        AuditAction.PROCESS,
        entity=document,
        summary=f"Ingested '{document.original_filename}' ({extracted.page_count} page(s))",
        metadata={
            "page_count": extracted.page_count,
            "is_scanned": document.is_scanned,
            "extractor": extracted.metadata.get("extractor"),
        },
    )
    logger.info("Ingested document %s (%s pages)", document.id, extracted.page_count)
    return document
