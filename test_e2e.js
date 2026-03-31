const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

async function run() {
    try {
        console.log("Uploading test image...");
        const formData = new FormData();
        formData.append("file", fs.createReadStream("test-image.png"));
        formData.append("id", "CERT-TEST-999");
        formData.append("studentName", "John Doe");
        formData.append("course", "Computer Science");
        formData.append("orgName", "MIT");

        let issueRes;
        try {
            issueRes = await axios.post("http://localhost:5000/api/certificates/issue", formData, {
                headers: formData.getHeaders()
            });
            console.log("Issue success!", issueRes.data.fileHash);
        } catch (e) {
            console.log("Issue Error:", e.response?.data || e.message);
            return;
        }

        console.log("Verifying without file...");
        const v1 = await axios.get("http://localhost:5000/api/certificates/verify/CERT-TEST-999");
        console.log("V1 Match:", v1.data.hashMatch, v1.data.verified, v1.data.storedFileHash);

        console.log("Verifying with fileHash (simulating frontend file drop)...");
        // Simulated hash from frontend
        const frontendHash = issueRes.data.fileHash; 
        const v2 = await axios.get("http://localhost:5000/api/certificates/verify/CERT-TEST-999?fileHash=" + frontendHash);
        console.log("V2 Match:", v2.data.hashMatch, v2.data.verified);

    } catch (e) {
        console.error("Critical error:", e.response?.data || e.message);
    }
}
run();
