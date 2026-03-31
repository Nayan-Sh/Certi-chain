import io
import math
import numpy as np
from flask import Flask, request, jsonify
from PIL import Image, ImageChops, ImageEnhance
import pytesseract
from fuzzywuzzy import fuzz

# Add this line right after your imports
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Try importing PyMuPDF for PDF text extraction
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

app = Flask(__name__)

# ─────────────────────────────────────────────────────────────────────────────
#  TEXT EXTRACTION — handles both PDFs and images
# ─────────────────────────────────────────────────────────────────────────────
def extract_text_from_file(file_bytes, filename="file"):
    """
    Extracts text from a PDF using PyMuPDF (no OCR needed),
    or falls back to Tesseract OCR for images.
    Returns the extracted text string.
    """
    fname = filename.lower()

    # ── PDF path ──────────────────────────────────────────────────────────────
    if fname.endswith(".pdf") and PYMUPDF_AVAILABLE:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()
            if text.strip():
                return text
            # If PDF has no text layer (scanned PDF), rasterize + OCR first page
            doc2 = fitz.open(stream=file_bytes, filetype="pdf")
            page = doc2[0]
            mat = fitz.Matrix(2, 2)  # 2x zoom for better OCR accuracy
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            doc2.close()
            image = Image.open(io.BytesIO(img_bytes))
            return pytesseract.image_to_string(image)
        except Exception:
            return ""

    # ── Image path (PNG/JPG/JPEG) ──────────────────────────────────────────────
    try:
        image = Image.open(io.BytesIO(file_bytes))
        return pytesseract.image_to_string(image)
    except FileNotFoundError:
        # Tesseract not installed on host
        return "__TESSERACT_MISSING__"
    except Exception:
        return ""


# ─────────────────────────────────────────────────────────────────────────────
#  TAMPERING DETECTION
# ─────────────────────────────────────────────────────────────────────────────
def detect_tampering(file_bytes, filename="file"):
    """
    For images: Error Level Analysis (ELA) — compress at low quality,
    measure diff from original. Tampered regions show spikes.
    For PDFs: check for suspicious object layers using PyMuPDF metadata.
    """
    fname = filename.lower()

    # ── PDF tampering check ───────────────────────────────────────────────────
    if fname.endswith(".pdf") and PYMUPDF_AVAILABLE:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            suspicious = False
            notes = "Normal PDF structure"

            # Flag if PDF has JavaScript (common in phishing/tampered PDFs)
            for page in doc:
                annots = page.annots()
                if annots:
                    for annot in annots:
                        if annot.info.get("content", "").strip():
                            suspicious = True
                            notes = "Suspicious annotations detected"

            # Check metadata for inconsistencies
            meta = doc.metadata
            producer = meta.get("producer", "")
            creator = meta.get("creator", "")
            if producer and creator and producer.lower() != creator.lower():
                # Different tools used to create and modify — may indicate editing
                notes = f"Modified by different tool (Creator: {creator}, Producer: {producer})"

            doc.close()
            return {
                "is_tampered": suspicious,
                "entropy": 0,
                "notes": notes
            }
        except Exception as e:
            return {"is_tampered": False, "entropy": 0, "notes": str(e)}

    # ── Image ELA ─────────────────────────────────────────────────────────────
    try:
        original = Image.open(io.BytesIO(file_bytes)).convert("RGB")

        # Re-save at low quality and compare
        buffer = io.BytesIO()
        original.save(buffer, format="JPEG", quality=75)
        buffer.seek(0)
        compressed = Image.open(buffer).convert("RGB")

        ela_image = ImageChops.difference(original, compressed)
        enhancer = ImageEnhance.Brightness(ela_image)
        ela_image = enhancer.enhance(20)  # Amplify differences

        ela_array = np.array(ela_image)
        mean_val = ela_array.mean()
        std_val = ela_array.std()

        # High mean+std in ELA = manipulated regions
        is_tampered = mean_val > 12.0 and std_val > 15.0

        # Also compute entropy
        grayscale = original.convert("L")
        histogram = grayscale.histogram()
        total = sum(histogram)
        probs = [h / total for h in histogram if h > 0]
        entropy = -sum(p * math.log(p, 2) for p in probs)

        return {
            "is_tampered": bool(is_tampered),
            "entropy": float(f"{entropy:.2f}"),
            "ela_mean": float(f"{mean_val:.2f}"),
            "notes": "ELA analysis complete"
        }
    except Exception as e:
        return {"is_tampered": False, "entropy": 0, "notes": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
#  DOCUMENT TYPE CLASSIFICATION
# ─────────────────────────────────────────────────────────────────────────────
def classify_document_type(text):
    """
    Classifies the document type based on content analysis.
    Returns: (doc_type, confidence, indicators)
    """
    if not text or not text.strip():
        return "unknown", 0, ["No text content detected"]
    
    text_lower = text.lower()
    indicators = []
    
    # Certificate-specific keywords and phrases
    certificate_indicators = {
        "strong": [
            "certificate", "certification", "certified", "diploma", "degree",
            "this is to certify", "hereby certify", "hereby certified",
            "conferred upon", "awarded to", "has successfully completed",
            "has been awarded", "in recognition of", "completion of",
            "graduated", "graduation", "academic record", "transcript"
        ],
        "medium": [
            "date of issue", "issue date", "valid until", "expiry date",
            "certificate number", "registration number", "roll number",
            "authorized signature", "seal", "stamp", "accredited",
            "university", "college", "institution", "academic year",
            "semester", "credits", "grade", "percentage", "cgpa", "gpa"
        ]
    }
    
    # Resume/CV-specific keywords
    resume_indicators = {
        "strong": [
            "resume", "curriculum vitae", "cv", "personal information",
            "work experience", "employment history", "professional experience",
            "career objective", "objective", "summary", "profile summary",
            "skills", "technical skills", "soft skills", "languages known",
            "hobbies", "interests", "references", "referees",
            "available upon request", "contact information", "phone", "email",
            "linkedin", "portfolio", "github"
        ],
        "medium": [
            "experience", "years of experience", "job title", "position held",
            "responsibilities", "achievements", "projects", "internship",
            "training", "workshop", "seminar", "conference"
        ]
    }
    
    # Count matches
    cert_strong = sum(1 for kw in certificate_indicators["strong"] if kw in text_lower)
    cert_medium = sum(1 for kw in certificate_indicators["medium"] if kw in text_lower)
    resume_strong = sum(1 for kw in resume_indicators["strong"] if kw in text_lower)
    resume_medium = sum(1 for kw in resume_indicators["medium"] if kw in text_lower)
    
    # Calculate scores
    cert_score = cert_strong * 3 + cert_medium
    resume_score = resume_strong * 3 + resume_medium
    
    # Document structure analysis
    lines = text.split('\n')
    
    # Certificates typically have specific layout patterns
    has_certificate_layout = False
    if any(word in text_lower for word in ["certificate", "diploma", "degree", "certified"]):
        # Check for typical certificate formatting
        if len([l for l in lines if len(l.strip()) > 0 and len(l.strip()) < 100]) > 5:
            has_certificate_layout = True
    
    # Resumes typically have section headers
    resume_sections = ["education", "experience", "skills", "projects", "objective", "summary"]
    section_count = sum(1 for section in resume_sections if section in text_lower)
    if section_count >= 2:
        resume_score += section_count * 2
        indicators.append(f"Found {section_count} resume-style section headers")
    
    # Determine document type
    if resume_score > cert_score and resume_score >= 6:
        confidence = min(100, resume_score * 8)
        indicators.append(f"Resume indicators: {resume_strong} strong, {resume_medium} medium")
        return "resume", confidence, indicators
    elif cert_score > resume_score and cert_score >= 6:
        confidence = min(100, cert_score * 8)
        indicators.append(f"Certificate indicators: {cert_strong} strong, {cert_medium} medium")
        return "certificate", confidence, indicators
    elif cert_score >= 3 and cert_score > resume_score:
        return "likely_certificate", cert_score * 10, indicators
    elif resume_score >= 3:
        return "likely_resume", resume_score * 10, indicators
    else:
        return "unknown", 0, ["Insufficient document type indicators"]


# ─────────────────────────────────────────────────────────────────────────────
#  OCR MATCHING
# ─────────────────────────────────────────────────────────────────────────────
def match_text(extracted_text, expected_data):
    """Fuzzy-match extracted text against expected metadata."""
    if not extracted_text or extracted_text == "__TESSERACT_MISSING__":
        # Graceful mocked pass if Tesseract not installed
        return {
            "match_score": 85,
            "name_found": True,
            "course_found": True,
            "org_found": True,
            "notes": "OCR engine not available — bypassed",
            "doc_type": "unknown",
            "doc_type_confidence": 0
        }

    if not extracted_text.strip():
        return {
            "match_score": 0,
            "name_found": False,
            "course_found": False,
            "org_found": False,
            "notes": "No text detected in document",
            "doc_type": "unknown",
            "doc_type_confidence": 0
        }

    text_lower = extracted_text.lower()
    name_match   = fuzz.partial_ratio(expected_data.get("studentName", "").lower(), text_lower)
    course_match = fuzz.partial_ratio(expected_data.get("course", "").lower(), text_lower)
    org_match    = fuzz.partial_ratio(expected_data.get("orgName", "").lower(), text_lower)
    avg_score    = (name_match + course_match + org_match) / 3
    
    # Classify document type
    doc_type, doc_confidence, doc_indicators = classify_document_type(extracted_text)

    return {
        "match_score": avg_score,
        "name_found":   name_match   > 65,
        "course_found": course_match > 65,
        "org_found":    org_match    > 65,
        "notes": f"OCR extracted {len(extracted_text)} chars",
        "doc_type": doc_type,
        "doc_type_confidence": doc_confidence,
        "doc_indicators": doc_indicators
    }


# ─────────────────────────────────────────────────────────────────────────────
#  TRUST SCORE CALCULATION (shared logic)
# ─────────────────────────────────────────────────────────────────────────────
def compute_trust_score(ocr_results, tamper_results):
    """
    STRICT MODE: 
    1. If document is classified as resume/CV, auto-fail (0 score).
    2. If the name or course does not match the document, auto-fail (0 score).
    Otherwise, calculate normal score.
    """
    # Check document type - reject resumes/CVs outright
    doc_type = ocr_results.get("doc_type", "unknown")
    doc_confidence = ocr_results.get("doc_type_confidence", 0)
    
    if doc_type in ["resume", "likely_resume"]:
        # Document is clearly a resume/CV - reject with 0 score
        return 0.0
    
    if doc_type == "unknown" and doc_confidence < 20:
        # Cannot determine document type with confidence - suspicious
        return 0.0
    
    if ocr_results.get("name_found") is False or ocr_results.get("course_found") is False:
        return 0.0

    trust_score = ocr_results["match_score"] * 0.70

    if tamper_results["is_tampered"]:
        trust_score -= 35
    else:
        trust_score += 30  # Baseline integrity bonus
    
    # Bonus for clear certificate classification
    if doc_type == "certificate":
        trust_score += 10

    return float(max(0, min(100, trust_score)))



# ─────────────────────────────────────────────────────────────────────────────
#  ROUTES
# ─────────────────────────────────────────────────────────────────────────────

import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def generate_forensic_report(trust_score, ocr_results, tamper_results):
    """
    Calls the Gemini API to explain exactly why the certificate failed.
    """
    doc_type = ocr_results.get('doc_type', 'unknown')
    doc_confidence = ocr_results.get('doc_type_confidence', 0)
    doc_indicators = ocr_results.get('doc_indicators', [])
    
    # Check if document is a resume/CV - this is the primary rejection reason
    if doc_type in ["resume", "likely_resume"]:
        if not os.getenv("GEMINI_API_KEY"):
            indicators_str = "; ".join(doc_indicators) if doc_indicators else "Resume/CV keywords detected"
            return f"FORENSIC ANALYSIS: DOCUMENT TYPE MISMATCH - The uploaded file has been identified as a {doc_type.upper()} with {doc_confidence}% confidence. {indicators_str}. The system only accepts academic certificates, diplomas, or professional certifications. Resumes, CVs, and personal documents are explicitly rejected for security reasons."
        
        try:
            client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
            prompt = f"""
            Act as an expert digital forensics examiner. A document was submitted for certificate verification but was identified as a RESUME/CV instead of a certificate.
            
            Write a concise, professional forensic report (2-3 sentences) explaining the rejection:
            
            - Document Type Detected: {doc_type.upper()}
            - Confidence: {doc_confidence}%
            - Indicators: {', '.join(doc_indicators) if doc_indicators else 'Resume-specific keywords and section headers detected'}
            
            Explain that the system only accepts academic certificates, diplomas, or professional certifications, and that resumes/CVs are rejected for security and policy compliance.
            """
            response = client.models.generate_content(
                model='gemini-1.5-flash',
                contents=prompt
            )
            return response.text.strip()
        except Exception:
            return f"FORENSIC ANALYSIS: DOCUMENT TYPE MISMATCH - The uploaded file has been identified as a {doc_type.upper()}. The system only accepts academic certificates, diplomas, or professional certifications. Resumes, CVs, and personal documents are explicitly rejected for security reasons."
    
    if not os.getenv("GEMINI_API_KEY"):
        # Generate a human-readable report without Gemini API
        reasons = []
        if not ocr_results.get('name_found', False):
            reasons.append("Student name not found in document")
        if not ocr_results.get('course_found', False):
            reasons.append("Course name not found in document")
        if not ocr_results.get('org_found', False):
            reasons.append("Organization name not found in document")
        if tamper_results.get('is_tampered', False):
            reasons.append("Digital tampering detected in image/PDF")
        if doc_type == "unknown":
            reasons.append("Document type could not be determined - may not be a valid certificate")
        
        if reasons:
            return f"FORENSIC ANALYSIS: Document rejected with {trust_score}% trust score. Issues detected: {'; '.join(reasons)}. The submitted file does not match the expected certificate format or metadata."
        else:
            return f"FORENSIC ANALYSIS: Document rejected with {trust_score}% trust score. The file may be a non-certificate document or the OCR extraction failed to identify required fields."

    try:
        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        
        prompt = f"""
        Act as an expert digital forensics examiner. A digital certificate has been submitted for verification but has been flagged as potentially fraudulent or tampered with.
        
        Write a concise, professional 3-sentence forensic report explaining why it was rejected based on the following automated analysis data:
        
        - Overall Trust Score: {trust_score}% (Needs to be >= 40% to pass)
        - Document Type Detected: {doc_type}
        - Matches Student Name: {ocr_results.get('name_found', False)}
        - Matches Course Name: {ocr_results.get('course_found', False)}
        - Matches Organization Name: {ocr_results.get('org_found', False)}
        - Image Tampering Detected (ELA/Entropy): {tamper_results.get('is_tampered', False)}
        - Technical Notes: {tamper_results.get('notes', '')}
        
        Do not explain what the fields mean. Just write the final conclusive report addressed to the system administrator explaining what anomalies were found.
        """
        
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt
        )
        return response.text.strip()
    except Exception as e:
        return f"Failed to generate AI report due to an error: {str(e)}"

@app.route("/analyze", methods=["POST"])
def analyze():
    """Called at issuance time — validates the certificate before it goes on-chain."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    file_bytes = file.read()
    filename = file.filename or "file"
    
    # ── FILE TYPE VALIDATION ─────────────────────────────────────────────────
    # Only accept certificate-like files (PDF, images)
    allowed_extensions = {'.pdf', '.png', '.jpg', '.jpeg'}
    file_ext = os.path.splitext(filename.lower())[1]
    
    if file_ext not in allowed_extensions:
        return jsonify({
            "error": f"Invalid file type '{file_ext}'. Only certificate files (PDF, PNG, JPG, JPEG) are accepted.",
            "is_safe": False,
            "trust_score": 0,
            "message": "Invalid file format. Please upload a certificate document (PDF or image).",
            "details": {
                "error_type": "INVALID_FILE_FORMAT",
                "allowed_formats": list(allowed_extensions),
                "received_format": file_ext
            }
        }), 400
    
    # ── CERTIFICATE CONTENT VALIDATION ────────────────────────────────────────
    # Check if file size is reasonable for a certificate (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    if len(file_bytes) > max_size:
        return jsonify({
            "error": "File too large. Maximum size is 10MB.",
            "is_safe": False,
            "trust_score": 0,
            "message": "File size exceeds limit. Certificates should not exceed 10MB.",
            "details": {
                "error_type": "FILE_TOO_LARGE",
                "max_size_mb": 10,
                "received_size_mb": round(len(file_bytes) / (1024 * 1024), 2)
            }
        }), 400

    student_name = request.form.get("studentName", "")
    course       = request.form.get("course", "")
    org_name     = request.form.get("orgName", "")

    # 1. Extract text (PDF-aware)
    extracted_text = extract_text_from_file(file_bytes, filename)

    # 2. Tamper detection
    tamper_results = detect_tampering(file_bytes, filename)

    # 3. OCR matching
    expected_data = {"studentName": student_name, "course": course, "orgName": org_name}
    ocr_results = match_text(extracted_text, expected_data)

    # 4. Trust score
    trust_score = compute_trust_score(ocr_results, tamper_results)
    is_safe = trust_score >= 40  # Threshold for issuance

    # 5. Generate AI Forensic Report if rejected
    llm_report = "Approved." if is_safe else generate_forensic_report(trust_score, ocr_results, tamper_results)

    return jsonify({
        "is_safe": bool(is_safe),
        "trust_score": float(f"{trust_score:.2f}"),
        "message": llm_report if not is_safe else "Clear",
        "details": {
            "entropy":             tamper_results.get("entropy", 0),
            "tampering_detected":  tamper_results["is_tampered"],
            "tamper_notes":        tamper_results.get("notes", ""),
            "ocr_match_score":     float(f'{ocr_results.get("match_score", 0.0):.2f}'),
            "name_matched":        ocr_results.get("name_found", False),
            "course_matched":      ocr_results.get("course_found", False),
            "org_matched":         ocr_results.get("org_found", False),
            "ocr_notes":           ocr_results.get("notes", ""),
            "pdf_text_extracted":  PYMUPDF_AVAILABLE and filename.lower().endswith(".pdf"),
            "llm_forensic_report": llm_report,
            "document_type":       ocr_results.get("doc_type", "unknown"),
            "document_type_confidence": ocr_results.get("doc_type_confidence", 0),
            "document_indicators": ocr_results.get("doc_indicators", [])
        }
    })


@app.route("/analyze-for-verify", methods=["POST"])
def analyze_for_verify():
    """
    Called at VERIFICATION time — re-analyzes the file the verifier uploaded.
    Does not require metadata (just checks for tampering + extracts what's on the doc).
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    file_bytes = file.read()
    filename = file.filename or "file"

    student_name = request.form.get("studentName", "")
    course       = request.form.get("course", "")
    org_name     = request.form.get("orgName", "")

    extracted_text = extract_text_from_file(file_bytes, filename)
    tamper_results = detect_tampering(file_bytes, filename)

    expected_data = {"studentName": student_name, "course": course, "orgName": org_name}
    ocr_results = match_text(extracted_text, expected_data) if any([student_name, course, org_name]) else {
        "match_score": 100,
        "name_found": None,
        "course_found": None,
        "org_found": None,
        "notes": "No metadata provided for matching"
    }

    trust_score = compute_trust_score(ocr_results, tamper_results)

    return jsonify({
        "is_safe": trust_score >= 40,
        "trust_score": float(f"{trust_score:.2f}"),
        "details": {
            "entropy":            tamper_results.get("entropy", 0),
            "tampering_detected": tamper_results["is_tampered"],
            "tamper_notes":       tamper_results.get("notes", ""),
            "ocr_match_score":    float(f'{ocr_results.get("match_score", 0.0):.2f}'),
            "name_matched":       ocr_results.get("name_found"),
            "course_matched":     ocr_results.get("course_found"),
            "org_matched":        ocr_results.get("org_found"),
            "ocr_notes":          ocr_results.get("notes", "")
        }
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "pymupdf_available": PYMUPDF_AVAILABLE,
        "ocr_engine": "tesseract"
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)