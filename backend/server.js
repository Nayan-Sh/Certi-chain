require('dotenv').config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Route imports
const certificateRoutes = require("./routes/certificateRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/certificates", certificateRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/certificatesDB")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

// --- BLOCKCHAIN BRIDGE SETUP ---

// 1. Load the ABI
const contractAbiPath = path.join(__dirname, "abis", "Certificate.json");
const contractJson = JSON.parse(fs.readFileSync(contractAbiPath, "utf8"));
const contractABI = contractJson.abi;

// 2. Load settings from .env
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contractAddress = process.env.CONTRACT_ADDRESS;
const privateKey = process.env.PRIVATE_KEY;

// 3. Setup Wallet/Signer
const wallet = new ethers.Wallet(privateKey, provider);

// 4. Create Contract Instances
const certificateContract = new ethers.Contract(contractAddress, contractABI, provider);
const contractWithSigner = new ethers.Contract(contractAddress, contractABI, wallet);

// The routes /api/issue and /api/verify have been moved to controllers/certificateController.js under /api/certificates

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));