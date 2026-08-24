# CertifyChain — Blockchain Certificate Verification System

A full-stack dApp for institutions to **issue, verify, and revoke certificates on-chain**, with AI forensic document analysis and a **deploy-from-wallet** smart-contract flow.

Every blockchain **write** (contract deployment, mint, revoke, SBT claim) is signed by the user's **MetaMask wallet** in the browser. The backend never holds a private key — it orchestrates AI analysis, IPFS storage, and the database, and validates each signed transaction receipt before recording it.

---

## Architecture

| Layer | Tech |
|---|---|
| Frontend | React 19 · Vite · Tailwind · ethers.js · MetaMask |
| Backend | Node.js · Express · MongoDB/Mongoose · ethers.js |
| AI Service | Python (Flask) — document classification & forensic OCR |
| Blockchain | Hardhat (Solidity 0.8.24) — Certificate + Soulbound NFT contracts |
| **On-chain signing** | **Admin / student MetaMask wallets** — backend is a stateless orchestrator (no `PRIVATE_KEY`) |
| Contract deployment | Admin deploys from MetaMask → address captured from the tx receipt → registered per-network with the backend (Sepolia default) |

---

## Features

- **AI document forensics** — certificate uploads are OCR'd, classified, and tamper-scored before minting (bulk uploads auto-extract student/course/org fields, then let you review them in an editable grid).
- **On-chain certificates** — each certificate is stored on-chain with its IPFS hash + file hash, so verification reads *live chain state* (tamper + revocation), not just the database.
- **Wallet-signed everything** — mint, revoke, and SBT claims are signed via MetaMask. The backend validates the signed receipt (status, contract address, signer) before writing to MongoDB.
- **Multi-network** — deploy once per network and switch freely: **Sepolia** (default for real use).
- **Revocation** — on-chain `revokeCertificate()` (admin wallet signs) *plus* a DB flag; verification reports `revoked: true` from the chain.
- **Soulbound certificates (SBT)** — students can claim a non-transferable NFT from their own wallet.
- **Real IPFS via Pinata** — optional; blank credentials fall back to demo (fake) CIDs for local dev.

---

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [MongoDB](https://www.mongodb.com/) running locally on port 27017
- [MetaMask](https://metamask.io/) browser extension
- Python 3.10+ (for the AI service)

---

## Wallet setup (one-time)

The browser signs all blockchain transactions, so each role needs a funded MetaMask account on the network it uses.

### Admin wallet

1. Install the **MetaMask** extension in your browser.
2. Create or import an account. **This account must hold native tokens** on every network you deploy/mint to (it pays gas for deployments, mints, and revokes).
3. Add the network(s) you plan to use. The app can add/switch networks automatically (Sepolia is pre-configured in `frontend/src/networks.js`), so this is mostly optional — see [Supported networks](#supported-networks) for faucets.

### Student wallet

Any MetaMask account works for **claiming a Soulbound certificate** — the student signs their own claim transaction (their wallet pays the gas). No token funding is needed on testnets that sponsor claims, but on Sepolia the student needs a little test ETH.

> On testnets, grab free tokens from each network's faucet (links below). Real (mainnet) use requires real funds in the admin wallet.

---

## Supported networks

| Network | chainId | RPC (default) | Gas token | Faucet | Explorer |
|---|---|---|---|---|---|
| **Sepolia** ⭐ (default) | `11155111` | `https://ethereum-sepolia-rpc.publicnode.com` | SepETH | https://faucet.sepolia.dev or https://sepoliafaucet.com | https://sepolia.etherscan.io |

RPC URLs are overridable per-network via `backend/.env` (`SEPOLIA_RPC_URL`) — swap in an Alchemy/Infura endpoint for production.
---

## Environment setup

Each service reads config from its own `.env` file. Templates are committed — copy each one and fill in real values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env          # optional — Vite proxies /api in dev
cp ai-service/.env.example ai-service/.env      # optional — AI works without it
```

The local-development defaults (Hardhat RPC, MongoDB URI, demo IPFS mode) are pre-filled, so a plain `cp` works for local runs. **Never commit `.env` files** — they contain secrets.

### `backend/.env`

| Variable | Required | Notes |
|---|---|---|
| `PORT` | ❌ | Defaults to `5000` |
| `MONGO_URI` | ✅ | `mongodb://127.0.0.1:27017/certificatesDB` |
| `JWT_SECRET` | ✅ | Session signing secret — backend **fails to start** without it |
| `JWT_EXPIRES` | ❌ | Defaults to `7d` |
| `CORS_ORIGIN` | ❌ | Allowed frontend origin, defaults to `http://localhost:5173` |
| `SEPOLIA_RPC_URL` | ❌ | Read RPC for chainId 11155111 |
| `AI_SERVICE_URL` | ❌ | Defaults to `http://127.0.0.1:5001` |
| `PINATA_API_KEY` / `PINATA_API_SECRET` | ❌ | Real IPFS pinning; blank = demo (fake CID) mode |
| `SMTP_HOST/PORT/USER/PASS/FROM` | ❌ | For email OTP delivery |
| `APP_BASE_URL` | ❌ | Public base URL for emailed verify links |
| `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_MINUTES` | ❌ | Brute-force lockout, defaults `5` / `15` |

> **No `PRIVATE_KEY`.** The backend performs no on-chain writes — it only *reads* chain state (verification, tx-receipt validation) via the RPC URLs above. Contract addresses come from the per-chain `ContractConfig` records registered through the dApp's Deploy panel.

---

## Quick start

Open **three terminals** and run each service:

### 1. Backend

```bash
cd backend
npm install
npm start           # http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173 (proxies /api to the backend)
```

### 3. AI Service (needed for document forensic analysis)

```bash
cd ai-service
pip install -r requirements.txt
python app.py       # http://127.0.0.1:5001
```

---

## Deploying the smart contracts

Deployment is **signed by your MetaMask wallet** — the addresses are captured from your signed transaction receipts and registered with the backend (per network), so there is no manual `.env` editing.

1. Log in as **admin**.
2. Navigate to **Deploy Contracts** in the sidebar.
3. Pick **Sepolia** as the target network. If your wallet isn't connected, click **Connect Wallet**, then **Switch wallet to this network**.
4. Click **Deploy Contracts from MetaMask**. Your wallet signs two transactions — `Certificate` and `SoulboundCertificate` — and the dApp registers both addresses with the backend for that chain.

> **Repeat this once per network** you intend to use. The Deploy panel shows which chains already have a live registered deployment.

---

## How on-chain actions work: prepare → sign → record

The backend never signs. Every write follows the same three-step flow with your MetaMask wallet:

| Step | Who | What happens |
|---|---|---|
| **1. Prepare** | Backend | Runs AI analysis, uploads the file to IPFS, generates the certificate ID. Returns the exact data to sign. **No chain write, no DB write.** |
| **2. Sign** | MetaMask (you) | The dApp prompts your wallet to call the contract (`issue`, `batchIssue`, `revoke`, `issueSBT`). You approve the transaction; the wallet broadcasts it. |
| **3. Record** | Backend | Verifies your signed receipt on-chain (`status`, contract address, signer), then writes the certificate/revoke/claim to MongoDB. A forged `txHash` is rejected because it must point to a real, successful, on-chain transaction. |

| Action | Signer | Contract call | Gas paid by |
|---|---|---|---|
| Mint single certificate | Admin | `Certificate.issueCertificate` | Admin wallet |
| Batch mint | Admin | `Certificate.batchIssueCertificates` | Admin wallet |
| Revoke certificate | Admin | `Certificate.revokeCertificate` | Admin wallet |
| Claim Soulbound NFT | Student | `SoulboundCertificate.issueSBT` | Student wallet |
| Deploy contracts (Sepolia) | Admin | contract creation | Admin wallet |

---

## One-time redeploy note

The current contracts add on-chain revocation (`revokeCertificate`) and student self-claim (`issueSBT`). If you deployed contracts before this upgrade, **redeploy on each network** from the Deploy panel so the new functions exist on-chain.

---

## Real IPFS via Pinata (optional)

By default (no Pinata credentials) the system uses **demo mode** — fake CIDs suitable only for local development. The backend logs which mode it's in at startup:

```
[IPFS] Real IPFS pinning via Pinata (PINATA_API_KEY is set)
[IPFS] Demo mode — fake CIDs (set PINATA_API_KEY + PINATA_API_SECRET for real IPFS)
```

To enable real, globally-pinned IPFS:

1. Create a free account at https://app.pinata.cloud/.
2. Open the **API Keys** tab and generate a key with **Pin** permission.
3. Set `PINATA_API_KEY` and `PINATA_API_SECRET` in `backend/.env` and restart the backend.

Certificates will then be pinned to IPFS with real CIDs, and the verify page's IPFS link resolves globally.

---

## Email OTP (optional)

Set the `SMTP_*` variables in `backend/.env` to deliver one-time-passwords by email. If left blank, OTP still works for demo sign-ups (the code is shown in the server console).

---

## AI Organization Training (institution name extraction)

During bulk upload, the AI forensic engine extracts the issuing institution's name from each certificate. Many issuers embed their name inside a **logo, crest, or stylized design** rather than printing it as plain text — making it invisible to standard text extraction.

The AI resolves the **exact institution name** using a trained **known-organization registry** (`ai-service/known_organizations.json`): it OCRs the logo/header zone of every certificate, then fuzzy-matches the result against your trained organizations and returns the canonical registered spelling.

### How to add your institutions

**Via the dApp (recommended):**
1. Log in as **admin**.
2. Navigate to **AI Training** in the sidebar.
3. Enter the exact institution name + any aliases, and click **Train AI**.
4. The AI hot-reloads the registry immediately — no restart needed.

**Via the JSON file directly:**
Edit `ai-service/known_organizations.json`. Each entry has:
```json
{
  "name": "Indian Institute of Technology, Delhi",
  "aliases": ["IIT Delhi", "IITD"],
  "keywords": ["iit", "delhi", "indian institute of technology"],
  "verify_hosts": ["iitd.ac.in", "verify.iitd.ac.in"]
}
```
- `name` — the exact spelling to use on certificates and in the UI.
- `aliases` — alternate names/abbreviations the PDF may contain (optional — auto-derived from `name`).
- `keywords` — distinctive tokens for loose matching (optional — auto-derived).
- `verify_hosts` — domains in QR/verify URLs for hostname-based resolution (optional).

**Via the AI service REST API** (direct, for scripting):
```bash
curl -X POST http://localhost:5001/organizations/train \
  -H "Content-Type: application/json" \
  -d '{"name":"Indian Institute of Technology, Delhi","aliases":["IIT Delhi","IITD"]}'
```

---

## Project structure

```
├── ai-service/          # Flask AI document forensic engine
│   └── app.py           # OCR, classification, tampering detection, trust scoring
├── backend/
│   ├── config/networks.js # Per-chain RPC map (Hardhat / Sepolia)
│   ├── controllers/     # Express route handlers (auth, certificates, history, …)
│   ├── middleware/      # Auth (JWT + RBAC) & file upload
│   ├── models/          # Mongoose schemas (Certificate, User, ContractConfig …)
│   ├── routes/          # Express routers (certificates, auth, contract, public …)
│   ├── services/        # blockchain (read-only + receipt validation), AI, IPFS, …
│   └── abis/            # Compiled contract artifacts (ABI + bytecode)
├── blockchain/
│   ├── contracts/       # Solidity sources (Certificate, SoulboundCertificate)
│   ├── scripts/         # deploy.js (legacy fallback)
│   └── test/
├── frontend/
│   └── src/
│       ├── App.jsx               # Main app & views (mint / verify / revoke flows)
│       ├── ContractDeploy.jsx    # Admin wallet-deploy view (per-network)
│       ├── networks.js           # Chain metadata for MetaMask switch/add
│       ├── api.js                # Axios client + auth/history helpers
│       └── hooks/
│           ├── useWallet.js      # Shared MetaMask connection + ensureNetwork()
│           └── useContract.js    # Signed contract calls (issue/batch/revoke/SBT)
└── README.md
```

---

## License

Internal project — not currently licensed for public use.
