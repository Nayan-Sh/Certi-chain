const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:5001";

async function analyzeWithAI(filePath, metadata) {
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    formData.append("studentName", metadata.studentName);
    formData.append("course", metadata.course);
    formData.append("orgName", metadata.orgName);

    const response = await axios.post(
        `${AI_SERVICE_URL}/analyze`,
        formData,
        {
            headers: formData.getHeaders(),
        }
    );
    return response.data;
}

module.exports = { analyzeWithAI };