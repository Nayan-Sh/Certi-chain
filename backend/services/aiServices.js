const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:5001";

/**
 * Sends a PDF certificate to the AI service for forensic analysis.
 *
 * The AI service extracts text via OCR, performs field-by-field comparison
 * against the provided metadata, detects tampering, classifies the document
 * type, and returns a trust score with detailed forensic analysis.
 *
 * @param {string} filePath  - Path to the uploaded PDF file
 * @param {object} metadata  - User-provided certificate details
 * @param {string} metadata.studentName
 * @param {string} metadata.course
 * @param {string} metadata.orgName
 * @returns {Promise<object>} AI analysis result
 */
async function analyzeWithAI(filePath, metadata) {
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    formData.append("studentName", metadata.studentName || "");
    formData.append("course", metadata.course || "");
    formData.append("orgName", metadata.orgName || "");

    // Optionally pass additional fields if provided
    if (metadata.certificateId) formData.append("certificateId", metadata.certificateId);
    if (metadata.issueDate) formData.append("issueDate", metadata.issueDate);
    if (metadata.grade) formData.append("grade", metadata.grade);

    try {
        const response = await axios.post(
            `${AI_SERVICE_URL}/analyze`,
            formData,
            {
                headers: formData.getHeaders(),
                timeout: 30000, // 30s timeout for AI analysis
            }
        );
        return response.data;
    } catch (err) {
        // AI service actively rejected the document (400 Bad Request)
        if (err.response && err.response.data) {
            const aiData = err.response.data;
            const errorType = aiData.error || "AI_VALIDATION_FAILED";

            console.warn(
                `[AI] AI service rejected document: ${errorType} — ${aiData.message || "No message"}`
            );

            // Log field-level details if available
            if (aiData.details && aiData.details.failed_critical_fields) {
                console.warn(
                    `[AI] Failed critical fields: ${aiData.details.failed_critical_fields.join(", ")}`
                );
            }
            if (aiData.details && aiData.details.field_results) {
                for (const [key, result] of Object.entries(aiData.details.field_results)) {
                    if (!result.matched) {
                        console.warn(
                            `[AI]   - ${result.field}: expected "${result.expected}" but found "${result.extracted}" (score: ${result.match_score}%)`
                        );
                    }
                }
            }

            const aiError = new Error(
                aiData.message || "AI forensic service rejected the document."
            );
            aiError.aiData = aiData; // Pass along full details for the controller
            throw aiError;
        }

        // AI service unavailable or network error — fail securely
        console.error(
            "[AI] AI service unavailable or returned unexpected error:",
            err.message
        );
        throw new Error(
            "AI forensic service is currently unavailable. Cannot verify document authenticity."
        );
    }
}

module.exports = { analyzeWithAI };
