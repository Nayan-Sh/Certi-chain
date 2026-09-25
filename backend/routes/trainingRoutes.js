const express = require("express");
const axios = require("axios");
const router = express.Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:5001";

const authMiddleware = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/authMiddleware");

// Enforce admin-only access for AI organization registry endpoints
router.use(authMiddleware);
router.use(requireRole("admin"));
router.get("/organizations", async (req, res) => {
  try {
    const { data } = await axios.get(`${AI_SERVICE_URL}/organizations`, { timeout: 10000 });
    res.json(data);
  } catch (err) {
    console.error("[AI Proxy] org list failed:", err.message);
    res.status(502).json({ error: "AI service unavailable." });
  }
});

router.post("/organizations/train", async (req, res) => {
  try {
    const { data } = await axios.post(
      `${AI_SERVICE_URL}/organizations/train`,
      req.body,
      { timeout: 10000 }
    );
    res.json(data);
  } catch (err) {
    console.error("[AI Proxy] org train failed:", err.message);
    res.status(502).json({ error: "AI service unavailable." });
  }
});

router.delete("/organizations/:name", async (req, res) => {
  try {
    const { data } = await axios.delete(
      `${AI_SERVICE_URL}/organizations/${encodeURIComponent(req.params.name)}`,
      { timeout: 10000 }
    );
    res.json(data);
  } catch (err) {
    console.error("[AI Proxy] org untrain failed:", err.message);
    const status = err.response?.status || 502;
    res.status(status).json(err.response?.data || { error: "AI service unavailable." });
  }
});

module.exports = router;
