"""
Text extraction from certificate files.

Supports:
    - Native PDF text extraction via PyMuPDF
    - OCR fallback via Tesseract for scanned PDFs and images
    - Logo/header region OCR with Gemini Vision or enhanced Tesseract preprocessing
"""

import io
import logging
import os

from PIL import Image, ImageChops, ImageEnhance
import pytesseract

from config import PYMUPDF_AVAILABLE, GENAI_AVAILABLE

if PYMUPDF_AVAILABLE:
    import fitz

if GENAI_AVAILABLE:
    from google import genai

logger = logging.getLogger(__name__)


def extract_text_from_file(file_bytes, filename="file"):
    """
    Extracts text from a PDF using PyMuPDF (no OCR needed for text PDFs),
    or falls back to Tesseract OCR for images & scanned PDFs.
    Returns the extracted text string.
    """
    fname = filename.lower()

    # ── PDF path ──────────────────────────────────────────────────────────
    if fname.endswith(".pdf") and PYMUPDF_AVAILABLE:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()

            if text.strip():
                logger.info("PDF text extracted via PyMuPDF: %d chars", len(text))
                return text

            # Scanned PDF → rasterize first page at 2x zoom + OCR
            doc2 = fitz.open(stream=file_bytes, filetype="pdf")
            page = doc2[0]
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            doc2.close()
            image = Image.open(io.BytesIO(img_bytes))
            text = pytesseract.image_to_string(image)
            logger.info("Scanned PDF OCR'd: %d chars", len(text))
            return text
        except FileNotFoundError:
            return "__TESSERACT_MISSING__"
        except Exception as e:
            logger.warning("PDF text extraction failed: %s", e)
            return ""

    # ── Image path (PNG/JPG/JPEG) ────────────────────────────────────────
    try:
        image = Image.open(io.BytesIO(file_bytes))
        text = pytesseract.image_to_string(image)
        logger.info("Image OCR'd: %d chars", len(text))
        return text
    except FileNotFoundError:
        return "__TESSERACT_MISSING__"
    except Exception as e:
        logger.warning("Image OCR failed: %s", e)
        return ""


def extract_logo_region_text(file_bytes, filename="file"):
    """
    Rasterize the top ~30% of the first page — the zone where logos and the
    issuer's name/crest normally sit. Uses Gemini Vision (if available) to read
    highly stylized fonts, falling back to Tesseract OCR with enhanced preprocessing.
    """
    fname = filename.lower()
    try:
        image = None
        if fname.endswith(".pdf") and PYMUPDF_AVAILABLE:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            page = doc[0]
            rect = page.rect
            # Logo/header band: top 30% of the page, full width.
            clip = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y0 + rect.height * 0.30)
            mat = fitz.Matrix(4, 4)  # 4x zoom for better logo text resolution
            pix = page.get_pixmap(matrix=mat, clip=clip)
            doc.close()
            image = Image.open(io.BytesIO(pix.tobytes("png")))
        else:
            img = Image.open(io.BytesIO(file_bytes))
            w, h = img.size
            image = img.crop((0, 0, w, int(h * 0.30)))

        # 1. Try Gemini GenAI Vision first (better for stylized fonts/logos)
        if GENAI_AVAILABLE and os.getenv("GEMINI_API_KEY"):
            try:
                img_byte_arr = io.BytesIO()
                image.save(img_byte_arr, format='PNG')
                img_bytes = img_byte_arr.getvalue()

                client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=[
                        "Extract ONLY the full name of the organization, institution, or company from this certificate header/logo. Do not include any other text. If no organization name is visible, output nothing.",
                        {'mime_type': 'image/png', 'data': img_bytes}
                    ]
                )
                result = response.text.strip()
                if result and len(result) > 3:
                    logger.info("Gemini Vision extracted organization from logo: %s", result)
                    return result
            except Exception as e:
                logger.warning("Gemini Vision failed for logo extraction, falling back to OCR: %s", e)

        # 2. Fallback to Tesseract OCR with enhanced preprocessing
        # Multiple preprocessing passes for better logo text extraction
        results = []

        # Pass 1: Upscale + contrast boost (original approach)
        image1 = image.resize((image.width * 2, image.height * 2), Image.LANCZOS)
        image1 = ImageEnhance.Contrast(image1).enhance(1.5)
        results.append(pytesseract.image_to_string(image1))

        # Pass 2: Higher contrast for low-contrast logos
        image2 = image.resize((image.width * 3, image.height * 3), Image.LANCZOS)
        image2 = ImageEnhance.Contrast(image2).enhance(2.0)
        image2 = ImageEnhance.Sharpness(image2).enhance(2.0)
        results.append(pytesseract.image_to_string(image2))

        # Pass 3: Grayscale + threshold for binary text
        image3 = image.resize((image.width * 2, image.height * 2), Image.LANCZOS)
        image3 = image3.convert('L')  # Grayscale
        # Apply threshold
        threshold = 128
        image3 = image3.point(lambda x: 255 if x > threshold else 0)
        results.append(pytesseract.image_to_string(image3))

        # Pass 4: Inverted (white text on dark background)
        image4 = image.resize((image.width * 2, image.height * 2), Image.LANCZOS)
        image4 = ImageEnhance.Contrast(image4).enhance(1.5)
        image4 = ImageChops.invert(image4.convert('RGB'))
        results.append(pytesseract.image_to_string(image4))

        # Combine all results, preferring longer non-empty results
        combined = "\n".join([r for r in results if r.strip()])
        logger.info("Logo region OCR combined result length: %d chars", len(combined))
        return combined

    except Exception as e:
        logger.warning("Logo-region extraction failed: %s", e)
        return ""
