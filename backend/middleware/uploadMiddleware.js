const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Absolute upload path — reliable regardless of the working directory.
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Create the directory on first use (multer's disk storage refuses to
        // write into a destination that does not already exist).
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        // Sanitize the original filename to prevent path traversal attacks.
        // Strip all path separators and keep only safe characters.
        const sanitized = path.basename(file.originalname)
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/\.{2,}/g, '_'); // no double dots
        cb(null, Date.now() + '-' + sanitized);
    }
});

// Only allow PDF files — reject everything else before it reaches the controller
const pdfOnlyFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMimes = ["application/pdf", "application/x-pdf", "application/octet-stream"];

    if (ext !== ".pdf" || !allowedMimes.includes(file.mimetype)) {
        const err = new Error(
            `Invalid file type '${ext || file.mimetype}'. Only PDF certificate documents are accepted.`
        );
        err.code = "INVALID_FILE_TYPE";
        return cb(err, false);
    }
    cb(null, true);
};

/**
 * Validates a PDF file buffer for single-page requirement and corruption.
 * Can be used by controllers for additional validation after upload.
 * Returns { isValid: boolean, pageCount: number, error: string|null }
 */
async function validateSinglePagePDF(fileBuffer) {
    try {
        const { PDFDocument } = require("pdf-lib");
        const pdfDoc = await PDFDocument.load(fileBuffer);
        const pageCount = pdfDoc.getPageCount();

        if (pageCount !== 1) {
            return {
                isValid: false,
                pageCount,
                error: `PDF has ${pageCount} pages. Only single-page certificates are accepted.`
            };
        }

        // Additional check: ensure PDF is not empty/corrupted
        const firstPage = pdfDoc.getPage(0);
        const { width, height } = firstPage.getSize();
        if (width === 0 || height === 0) {
            return {
                isValid: false,
                pageCount,
                error: 'PDF page has zero dimensions (corrupted or empty).'
            };
        }

        return { isValid: true, pageCount, error: null };
    } catch (err) {
        // Check if it's a corruption error
        const errorMessage = err.message || String(err);
        if (errorMessage.includes('Invalid PDF') ||
            errorMessage.includes('corrupt') ||
            errorMessage.includes('Missing') ||
            errorMessage.includes('trailer') ||
            errorMessage.includes('EOF')) {
            return {
                isValid: false,
                pageCount: 0,
                error: 'Could not read PDF file - file appears to be corrupted or not a valid PDF.'
            };
        }
        return {
            isValid: false,
            pageCount: 0,
            error: 'Could not read PDF file.'
        };
    }
}

const upload = multer({
    storage,
    fileFilter: pdfOnlyFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB max per file
});

module.exports = { upload, validateSinglePagePDF };
