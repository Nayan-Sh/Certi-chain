require('dotenv').config({ override: true });
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Security middleware — config guards, headers, NoSQL sanitization, rate limit, error handler
const { assertConfig, securityHeaders, sanitizeMongo, rateLimit, notFound, errorHandler } = require("./middleware/security");

// Route imports
const certificateRoutes = require("./routes/certificateRoutes");
const authRoutes = require("./routes/authRoutes");
const historyRoutes = require("./routes/historyRoutes");
const publicRoutes = require("./routes/publicRoutes");
const contractRoutes = require("./routes/contractRoutes");
const trainingRoutes = require("./routes/trainingRoutes");

// Validate configuration at startup (warns on weak JWT_SECRET, missing MONGO_URI, etc.)
assertConfig({ exitOnFailure: false });

const app = express();

// Restrict cross-origin requests to the frontend origin. Override via
// CORS_ORIGIN env for production deployments (comma-separated list).
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];

app.use(cors({ origin: function (origin, callback) {
  if (!origin || corsOrigins.includes(origin) || corsOrigins.includes('*')) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
}}));
app.use(securityHeaders);
app.use(sanitizeMongo);
app.use(express.json());
// Skip rate limiting for OPTIONS preflight so the browser's first request never fails (#3 fix)
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, skip: (req) => req.method === 'OPTIONS' }));

// Routes — public verify MUST be registered before the protected certificate
// router so /api/certificates/verify/:id is reachable without a JWT.
app.get("/api/health", (req, res) => res.json({ status: "ok", ts: Date.now() }));
app.use("/api/auth", authRoutes);
app.use("/api/certificates", publicRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/contract", contractRoutes);
app.use("/api/ai", trainingRoutes);

// 404 catch-all and centralised error handler
app.use(notFound);
app.use(errorHandler);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/certificatesDB")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

// IPFS storage mode — real Pinata pinning when credentials are configured,
// otherwise fake CIDs suitable only for local dev.
if (process.env.PINATA_API_KEY && process.env.PINATA_API_SECRET) {
  console.log("[IPFS] Real IPFS pinning via Pinata (PINATA_API_KEY is set)");
} else {
  console.log("[IPFS] Demo mode — fake CIDs (set PINATA_API_KEY + PINATA_API_SECRET for real IPFS)");
}

// Blockchain interaction is handled lazily by services/blockchainService.js,
// which resolves the deployed contract address from the ContractConfig DB
// record (registered by the admin via /api/contract/register after deploying
// from MetaMask) with backend/.env as a fallback.

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));