"""Image / OCR extraction (Phase 2 implementation).

pytesseract-backed OCR for scanned pages and image documents. Requires the
``tesseract`` binary on PATH; all imports are lazy so environments without OCR
still boot and run the non-OCR pipeline.
"""
from __future__ import annotations

import io
from dataclasses import dataclass


@dataclass
class OcrResult:
    page_number: int
    text: str
    confidence: float | None = None


def ocr_image_bytes(image_bytes: bytes) -> str:
    """OCR raw image bytes → text. Returns '' on any failure (best-effort)."""
    try:
        import pytesseract
        from PIL import Image

        with Image.open(io.BytesIO(image_bytes)) as img:
            return pytesseract.image_to_string(img).strip()
    except Exception:  # pragma: no cover - OCR unavailable / undecodable image
        return ""


def ocr_image_file(file_path: str) -> str:
    try:
        import pytesseract
        from PIL import Image

        with Image.open(file_path) as img:
            return pytesseract.image_to_string(img).strip()
    except Exception:  # pragma: no cover
        return ""


def ocr_document(file_path: str) -> list[OcrResult]:
    """OCR an image document as a single page."""
    return [OcrResult(page_number=1, text=ocr_image_file(file_path))]
