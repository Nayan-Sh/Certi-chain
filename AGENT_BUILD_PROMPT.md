# CertifyChain: Complete Full-Stack Web3 Project Builder Prompt

## Project Overview

Build **CertifyChain** — a complete full-stack Web3 application for issuing, verifying, and revoking digital certificates on the blockchain. The system includes:

- **Blockchain Layer**: Hardhat smart contracts (Solidity) for Certificate and SoulboundCertificate (SBT) tokens
- **Backend**: Express.js + MongoDB REST API with authentication, certificate management, and blockchain verification
- **Frontend**: React (Vite) + ethers.js for MetaMask integration and Web3 functionality
- **AI Service**: Python FastAPI for document forensics (AI Guard for certificate verification)
- **Storage**: Pinata IPFS integration for decentralized file storage

## Architecture Goals

1. **Single Source of Truth**: MongoDB stores deployed contract addresses per chainId
2. **Fresh Contract Info**: Frontend always fetches fresh contract data before signing transactions
3. **Diagnostic Logging**: Complete address tracing at every stage of minting/verification
4. **MetaMask Integration**: All blockchain writes signed by connected wallet (admin or student)
5. **Transaction Verification**: Backend validates transaction receipts against registered contracts
6. **IPFS Storage**: Certificates stored decentralized via Pinata
7. **AI Forensics**: Document verification before blockchain recording
8. **Multi-Chain**: Support Sepolia (11155111) and other networks

## Project Structure

```
certi-chain/
├── blockchain/                 # Smart contracts & deployment
│   ├── contracts/
│   │   ├── Certificate.sol
│   │   └── SoulboundCertificate.sol
│   ├── scripts/
│   │   └── deploy.js           # Deploys contracts, syncs to backend
│   ├── hardhat.config.js
│   ├── package.json
│   └── artifacts/              # Compiled ABIs & bytecode
│
├── backend/                    # Express.js API server
│   ├── models/
│   │   ├── ContractConfig.js   # MongoDB schema for deployed addresses
│   │   ├── User.js
│   │   ├── Certificate.js
│   │   ├── VerificationHistory.js
│   │   └── OTP.js
│   ├── routes/
│   │   ├── contractRoutes.js   # /api/contract/* endpoints
│   │   ├── certificateRoutes.js # /api/certificate/* endpoints
│   │   ├── authRoutes.js       # /api/auth/* endpoints
│   │   └── verifyRoutes.js     # /api/verify/* endpoints
│   ├── controllers/
│   │   ├── certificateController.js
│   │   ├── contractController.js
│   │   └── authController.js
│   ├── services/
│   │   ├── blockchainService.js # Contract interaction & verification
│   │   ├── ipfsService.js       # Pinata integration
│   │   └── emailService.js      # OTP delivery
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── errorHandler.js
│   ├── config/
│   │   ├── database.js
│   │   └── networks.js          # Network/RPC configuration
│   ├── .env                     # Configuration (gitignored)
│   ├── server.js                # Express app entry
│   ├── package.json
│   └── abis/                    # Contract ABIs
│
├── frontend/                   # React + Vite SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── Navigation.jsx
│   │   │   └── ...
│   │   ├── views/
│   │   │   ├── DashboardView.jsx    # View & verify certificates
│   │   │   ├── IssueView.jsx        # Single & batch minting
│   │   │   ├── VerifyView.jsx       # Public certificate verification
│   │   │   └── AdminView.jsx        # Admin panel
│   │   ├── hooks/
│   │   │   ├── useWallet.js         # MetaMask integration
│   │   │   ├── useContract.js       # Contract interaction (fresh data)
│   │   │   └── useAuth.js           # Authentication
│   │   ├── ContractDeploy.jsx       # Admin: Deploy contracts
│   │   ├── api.js                   # Axios instance
│   │   ├── networks.js              # Network configuration
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
│
└── ai-service/                 # Python FastAPI for document verification
    ├── main.py                 # FastAPI app
    ├── requirements.txt
    └── services/
        └── forensics.py        # Document analysis & verification
```

## Key Features to Implement

### 1. Smart Contracts (Blockchain/Solidity)

**Certificate.sol** - Main certificate contract
- `issueCertificate(id, studentName, course, orgName, ipfsHash, fileHash)` - Issue single cert
- `batchIssueCertificates(ids[], names[], courses[], orgs[], ipfsHashes[], fileHashes[])` - Batch mint
- `revokeCertificate(certId)` - Revoke certificate
- `verifyCertificate(certId)` - Return cert metadata if not revoked
- `getRevokedCount()` - Get revoked certificate count
- Events: `CertificateIssued`, `CertificateRevoked`, `CertificateVerified`

**SoulboundCertificate.sol** - Non-transferable NFT for students
- `claimCertificateAsNFT(certId)` - Student claims certificate as bound NFT
- `verifySoulbound(certId)` - Check if NFT was claimed
- No transfer functions (soulbound)

**Deployment** (scripts/deploy.js)
- Deploy both contracts
- Sync deployed addresses to `backend/.env` via `setEnvValue()` helper
- Copy compiled ABIs to `backend/abis/` directory
- Log deployment details

### 2. Backend Express.js API

**Core Routes:**

- `POST /api/contract/register` - Register deployed contract addresses with bytecode verification
- `GET /api/contract/info?chainId=` - Get contract address + ABI from MongoDB
- `GET /api/contract/status?chainId=` - Check deployment status
- `GET /api/contract/artifact/:name` - Get contract artifact (bytecode for deployment)

- `POST /api/certificate/issue` - Record single certificate mint (requires valid txHash)
- `POST /api/certificate/batch-issue` - Record batch certificate mints
- `POST /api/certificate/record-mint` - Verify txHash and record mint
- `GET /api/certificate/list` - List certificates for admin
- `GET /api/certificate/:certId` - Get certificate details
- `POST /api/certificate/revoke` - Revoke certificate
- `GET /api/certificate/verify/:certId` - Public verify endpoint (no auth)

- `POST /api/auth/register` - Register user (admin via invite code)
- `POST /api/auth/login` - Email OTP login
- `POST /api/auth/verify-otp` - Verify OTP and issue JWT
- `POST /api/auth/logout` - Logout

**Key Services:**

**blockchainService.js**:
- `getRegisteredAddresses(chainId)` - Query MongoDB for deployed addresses
- `getCertificateContractInfo(chainId)` - Return address + ABI, verify bytecode exists
- `getSBTContractInfo(chainId)` - Return SBT address + ABI
- `verifyTxReceipt(txHash, chainId, expectedTo, expectedFrom)` - Validate transaction:
  - Fetch receipt from RPC
  - Normalize addresses (checksummed)
  - Verify receipt.to === expectedTo
  - Log detailed diagnostics
- `verifyOnBlockchain(certId, chainId)` - Call contract.verifyCertificate()

**ipfsService.js**:
- `uploadToIPFS(fileBuffer, filename)` - Upload file to Pinata, return IPFS hash
- `getIPFSUrl(hash)` - Generate Pinata gateway URL

**emailService.js**:
- `sendOTP(email)` - Generate OTP, send via SMTP (Gmail)
- `verifyOTP(email, otp)` - Check OTP validity

**Models:**

- **ContractConfig** - Mongoose schema with _id as chainId string
  - Fields: _id (chainId), certAddress, sbtAddress, certTxHash, sbtTxHash, deployedBy, deployedAt, chainId
  - Upsert pattern ensures exactly one document per chainId

- **Certificate** - Store certificate records
  - Fields: certId, studentName, course, orgName, ipfsHash, fileHash, transactionHash, blockNumber, chainId, issuer, createdAt, revoked, aiScore

- **User** - Store user data
  - Fields: email, role (admin|student), verified, createdAt

- **VerificationHistory** - Audit trail
  - Fields: certId, verifiedBy, timestamp, status

### 3. Frontend React + Vite

**useContract.js Hook** - Blockchain interaction with fresh data:
```javascript
// Core functions:
- getContractInfo(chainId) - Get from cache or API with 5-min TTL
- getFreshContractInfo(chainId) - Clear all caches, fetch fresh
  - Delete cacheRef.current[key]
  - Delete cacheTimestampsRef.current[key]
  - Clear localStorage & sessionStorage
  - Fetch from /api/contract/info?chainId=
- issue(chainId, id, studentName, course, orgName, ipfsHash, fileHash)
  - Call getFreshContractInfo() before signing
  - Create contract instance with fresh address
  - Call contract.issueCertificate()
  - Log address at every stage
  - Return txHash
- batchIssue(chainId, ids[], names[], courses[], orgs[], ipfsHashes[], fileHashes[])
  - Same flow but batchIssueCertificates()
- revoke(chainId, certId) - Revoke certificate
- verify(chainId, certId) - Read-only verification
- invalidateCache(chainId) - Clear cache after deployment
```

**useWallet.js Hook** - MetaMask integration:
```javascript
- connect() - Request wallet connection
- ensureNetwork(targetChainId) - Switch network if needed
- switchNetwork(chainId) - Request network switch
- Properties: account, chainId, isConnecting, isConnected, isInitialized
```

**Key Views:**

- **IssueView.jsx** - Mint certificates
  - Single: Upload PDF, fill details, click mint
  - Batch: Upload multiple PDFs, analyze (AI Guard), review, mint all
  - Calls `contract.issue()` or `contract.batchIssue()`
  - Shows transaction hash and receipt confirmation

- **DashboardView.jsx** - List & manage certificates
  - Show all minted certificates
  - Revoke option
  - IPFS preview links

- **VerifyView.jsx** - Public certificate verification
  - Enter certificate ID
  - Display certificate metadata (name, course, org)
  - Show verification status
  - No authentication required

- **ContractDeploy.jsx** - Admin panel
  - Fetch contract artifacts from `/api/contract/artifact/{name}`
  - Sign deployment transaction in MetaMask
  - Call POST `/api/contract/register` with deployed addresses
  - Display success with deployed addresses
  - Clear cache after deployment

**Configuration:**

- **networks.js** - Network configuration
  ```javascript
  {
    11155111: {
      name: 'Sepolia',
      rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
      chainId: 11155111,
      nativeCurrency: 'ETH'
    }
  }
  ```

- **api.js** - Axios instance with baseURL and error handling

### 4. AI Service (Python FastAPI)

**main.py** - FastAPI endpoint
```python
POST /verify - Verify document authenticity
- Accept: PDF file
- Return: {
    valid: boolean,
    score: 0-100,
    details: {...},
    warnings: []
  }
```

**services/forensics.py** - Document analysis
- Check for tampering
- Verify fonts and layout consistency
- Detect copy-paste or manipulation
- Return confidence score

## Implementation Requirements

### Database
- **MongoDB** (local or cloud)
  - Database: `certificatesDB`
  - Collections: certificates, users, contractconfigs, otps, verificationhistories

### Blockchain
- **Hardhat** for development (local node or Sepolia testnet)
- **Sepolia Testnet** for testing
- Smart contracts deploy via ethers.js in browser (MetaMask signing)

### Authentication
- **JWT tokens** stored in httpOnly cookies
- **Email OTP** via Gmail SMTP
- Role-based: admin (deploy, issue, revoke) | student (claim SBT, verify)

### IPFS
- **Pinata** account for IPFS pinning
- Upload certificate PDFs to Pinata
- Store IPFS hash on blockchain

### Environment Variables

**backend/.env:**
```
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/certificatesDB
JWT_SECRET=<random-secret>
JWT_EXPIRES=7d
CORS_ORIGIN=http://localhost:5173,http://localhost:5174

SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

AI_SERVICE_URL=http://127.0.0.1:5001
AI_SERVICE_TOKEN=<token>

PINATA_API_KEY=<key>
PINATA_API_SECRET=<secret>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<email>
SMTP_PASS=<app-password>
SMTP_FROM="CertifyChain <noreply@yourdomain.com>"
APP_BASE_URL=http://localhost:5173

ADMIN_INVITE_CODE=<code>
```

## Deployment Sequence

1. **Deploy Smart Contracts**
   - Run: `cd blockchain && npx hardhat compile`
   - Deploy script: `npx hardhat run scripts/deploy.js --network sepolia`
   - Gets deployed addresses from receipts
   - Syncs to backend/.env
   - Copies ABIs to backend/abis/

2. **Start MongoDB**
   - Local: `mongod` or Docker
   - Or cloud MongoDB Atlas

3. **Start Backend**
   - `cd backend && npm install && npm start`
   - Runs on port 5000
   - Reads from backend/.env
   - Connects to MongoDB
   - Serves API endpoints

4. **Start AI Service**
   - `cd ai-service && python -m pip install -r requirements.txt`
   - `python main.py` (uvicorn)
   - Runs on port 5001

5. **Start Frontend**
   - `cd frontend && npm install && npm run dev`
   - Runs on port 5173
   - Opens in browser

## Testing Flow

### Single Certificate Minting
1. Admin login → Issue tab
2. Fill: Student name, Course, Organization
3. Upload PDF certificate
4. Click "AI Guard & Sign Mint (MetaMask)"
5. Sign in MetaMask
6. Observe:
   - Frontend console logs show correct contract address
   - Transaction sent to blockchain
   - Receipt confirms target address
   - Backend verifies and records
   - Certificate appears in Dashboard

### Batch Certificate Minting
1. Admin → Issue → Bulk Upload
2. Upload 2+ PDF certificates
3. Click "Analyze & Review"
4. Wait for AI Guard analysis
5. Click "Mint X Reviewed Certificates"
6. Sign in MetaMask
7. All certificates recorded and appear in Dashboard

### Public Verification
1. Any user → Verify tab
2. Enter certificate ID
3. See metadata and verification status
4. No authentication required

### Transaction Verification
1. Copy transaction hash from success message
2. Go to Etherscan: `https://sepolia.etherscan.io/tx/{txHash}`
3. Verify:
   - To: correct contract address
   - From: admin wallet
   - Status: Success

## Critical Implementation Details

### Contract Address Flow
1. Admin deploys contracts from MetaMask → gets txHash
2. Deploy script reads receipt → extracts deployed addresses
3. Syncs to backend/.env (optional fallback)
4. Frontend calls `POST /api/contract/register` with addresses
5. Backend verifies bytecode exists on chain
6. Backend stores in MongoDB ContractConfig (single entry per chainId)
7. Frontend fetches from `GET /api/contract/info?chainId=`
8. Frontend calls `getFreshContractInfo()` before EVERY transaction
9. Always uses address from MongoDB (source of truth)

### Transaction Verification
1. Frontend signs transaction with contract address from MongoDB
2. MetaMask broadcasts transaction
3. Frontend gets txHash
4. Frontend calls `POST /api/certificate/record-mint` with txHash
5. Backend fetches receipt from RPC provider
6. Backend calls `verifyTxReceipt(txHash, chainId, expectedAddress, expectedFrom)`
7. Normalizes both addresses with ethers.getAddress() (checksummed)
8. Compares receipt.to === expectedAddress
9. If match: record certificate
10. If mismatch: error with clear diagnostics

### Diagnostic Logging
Add console.logs throughout pipeline:

**Frontend (useContract.js):**
```javascript
[useContract] Fetching FRESH contract info for chainId=${key} (bypassing cache)
[useContract] Cleared browser storage for chainId=${key}
[useContract] Signing issue() to contract: ${certAddress} on chainId=${chainId}
[useContract] Signer: ${signerAddr}
[useContract] Transaction confirmed. Target: ${receipt.to}, Hash: ${tx.hash}
```

**Backend (blockchainService.js):**
```javascript
[Blockchain] verifyTxReceipt: txHash=${txHash}, chainId=${chainId}, expectedTo=${expectedTo}
[Blockchain] Receipt details: to=${normalizedReceiptTo}, from=${receipt.from}, gasUsed=${receipt.gasUsed}
[Blockchain] ✓ Receipt verified: transaction successfully targeted contract ${normalizedReceiptTo}
[Blockchain] ❌ ADDRESS MISMATCH: receipt.to=${normalizedReceiptTo} !== expected=${normalizedExpectedTo}
```

**Backend (certificateController.js):**
```javascript
[Record Mint] Verifying ${records.length} certificates. txHash=${txHash}, chainId=${chainId}
[Record Mint] Expected contract address: ${certAddress}
[Record Mint] ✓ Transaction verified successfully against contract ${certAddress}
```

## Success Criteria

✅ Smart contracts deploy and store on Sepolia
✅ Contract addresses registered in MongoDB
✅ Frontend fetches fresh addresses before every transaction
✅ Single certificates mint to correct contract address
✅ Batch certificates mint to correct contract address
✅ All diagnostic logs show correct address at every stage
✅ Transaction receipts verified against registered contract
✅ Certificates recorded in database
✅ Public verification works (no auth required)
✅ AI Guard analyzes documents before minting
✅ IPFS storage integrated for PDF persistence
✅ Email OTP authentication works
✅ Admin can revoke certificates
✅ Students can claim certificates as soulbound NFTs
✅ All logs show correct contract address, NO address mismatches

## Deliverables

Provide complete, working project with:
1. All source files fully implemented
2. Smart contracts compiled and ready
3. Backend API fully functional
4. Frontend SPA with all views
5. AI service for document verification
6. Environment variable templates
7. Database schemas and models
8. Comprehensive README with setup instructions
9. Diagnostic logging throughout
10. Transaction verification and validation

The entire system should be production-ready and deployable to Sepolia testnet or live networks.
