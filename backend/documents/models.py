"""Document domain models.

``UploadedDocument`` is the durable record of an ingested governance artifact.
``DocumentChunk`` holds the parsed/segmented text produced by the ingestion +
RAG pipeline (Phase 2). The chunk model is defined now so the schema is stable
and later phases only populate it — never migrate it.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models

from common.enums import ChunkType, DocumentStatus, DocumentType
from common.models import BaseModel


def document_upload_path(instance: "UploadedDocument", filename: str) -> str:
    # Stored under a date-partitioned tree; the DB row keeps the original name.
    return f"documents/{instance.sha256[:2]}/{instance.sha256}/{filename}"


class UploadedDocument(BaseModel):
    file = models.FileField(upload_to=document_upload_path)
    original_filename = models.CharField(max_length=255)
    extension = models.CharField(max_length=16)
    mime_type = models.CharField(max_length=128, help_text="Content-sniffed MIME type.")
    declared_mime_type = models.CharField(max_length=128, blank=True)
    size_bytes = models.BigIntegerField()
    # Content fingerprint — enables de-duplication and deterministic caching.
    sha256 = models.CharField(max_length=64, db_index=True)

    doc_type = models.CharField(
        max_length=32, choices=DocumentType.choices, default=DocumentType.OTHER
    )
    status = models.CharField(
        max_length=16, choices=DocumentStatus.choices, default=DocumentStatus.UPLOADED
    )

    # Populated during ingestion (Phase 2).
    page_count = models.PositiveIntegerField(null=True, blank=True)
    is_scanned = models.BooleanField(null=True, blank=True)
    # Full extracted text + a map of global char-offset ranges to page numbers,
    # so evidence quotes can always be resolved back to a page (Rule 2).
    extracted_text = models.TextField(blank=True, default="")
    page_map = models.JSONField(default=list, blank=True)

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="documents",
    )
    metadata = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.original_filename} [{self.status}]"


class DocumentChunk(BaseModel):
    """A retrievable segment of a document. Populated by the RAG pipeline."""

    document = models.ForeignKey(
        UploadedDocument, on_delete=models.CASCADE, related_name="chunks"
    )
    chunk_index = models.PositiveIntegerField()
    page_number = models.PositiveIntegerField(null=True, blank=True)
    chunk_type = models.CharField(
        max_length=16, choices=ChunkType.choices, default=ChunkType.RECURSIVE
    )
    text = models.TextField()
    char_start = models.PositiveIntegerField(null=True, blank=True)
    char_end = models.PositiveIntegerField(null=True, blank=True)
    token_count = models.PositiveIntegerField(null=True, blank=True)
    # Identifier of the corresponding vector in the ChromaDB collection.
    embedding_id = models.CharField(max_length=128, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["document_id", "chunk_index"]
        constraints = [
            models.UniqueConstraint(
                fields=["document", "chunk_index"], name="uniq_document_chunk_index"
            )
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.document_id}#{self.chunk_index}"
