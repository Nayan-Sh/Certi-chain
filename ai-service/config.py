"""
Centralised configuration for the Certificate Verification AI Service.

Responsibilities:
    - Load environment variables (.env)
    - Configure structured logging
    - Locate the Tesseract OCR binary cross-platform
    - Probe optional dependencies (PyMuPDF, google-genai)
    - Provide a Flask application factory
"""

import logging
import os
import shutil
import sys

from dotenv import load_dotenv
from flask import Flask

# ── Env ──────────────────────────────────────────────────────────────────────
load_dotenv(override=True)

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[AI-SERVICE] %(asctime)s %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Tesseract binary ────────────────────────────────────────────────────────
import pytesseract  # noqa: E402 — must come after dotenv/logging

TESSERACT_CMD = shutil.which("tesseract") or (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if sys.platform == "win32"
    else "/usr/bin/tesseract"
)
pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
logger.info("Using Tesseract at: %s", TESSERACT_CMD)

# ── Optional Dependencies ───────────────────────────────────────────────────
try:
    import fitz  # noqa: F401 — PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    logger.warning("PyMuPDF (fitz) not available — PDF text extraction disabled")

try:
    from google import genai  # noqa: F401
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    logger.warning("google-genai not available — Gemini forensic reports disabled")

# ── Known-Organizations file path ───────────────────────────────────────────
KNOWN_ORGS_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "known_organizations.json"
)

# ── Flask App Factory ───────────────────────────────────────────────────────

def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__)

    # Register blueprints
    from routes.analyze_routes import analyze_bp
    from routes.training_routes import training_bp

    app.register_blueprint(analyze_bp)
    app.register_blueprint(training_bp)

    return app
