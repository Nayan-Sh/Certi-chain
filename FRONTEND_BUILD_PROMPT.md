# CertifyChain Frontend: Complete Build Prompt

## Project Overview

Build the **CertifyChain Frontend** — a complete React + Vite single-page application (SPA) for managing digital certificates on the blockchain. The frontend integrates with MetaMask for Web3 functionality and connects to a backend REST API.

**Key Technologies:**
- React 18+ (Vite)
- ethers.js v6 for blockchain interaction
- MetaMask wallet integration
- Axios for API calls
- Tailwind CSS / Lucide icons for UI
- JWT authentication with httpOnly cookies

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Header.jsx              # Top navigation with logo, user info
│   │   ├── Navigation.jsx          # Tab navigation (Dashboard, Issue, Verify, Deploy)
│   │   ├── Toast.jsx               # Toast notifications (success, error, info)
│   │   ├── LoadingSpinner.jsx      # Loading indicator
│   │   └── ProtectedRoute.jsx      # Route protection for authenticated pages
│   ├── views/
│   │   ├── DashboardView.jsx       # List & manage certificates
│   │   ├── IssueView.jsx           # Single & batch certificate minting
│   │   ├── VerifyView.jsx          # Public certificate verification (no auth)
│   │   └── AdminView.jsx           # Admin-only panel (if needed)
│   ├── hooks/
│   │   ├── useWallet.js            # MetaMask wallet connection & state
│   │   ├── useContract.js          # Smart contract interaction with fresh data
│   │   ├── useAuth.js              # Authentication & JWT management
│   │   └── useToast.js             # Toast notification management
│   ├── pages/
│   │   ├── LoginPage.jsx           # Email/OTP login
│   │   ├── HomePage.jsx            # Landing page
│   │   └── NotFoundPage.jsx        # 404 page
│   ├── services/
│   │   └── storageService.js       # LocalStorage/SessionStorage utilities
│   ├── api.js                      # Axios instance with baseURL & interceptors
│   ├── networks.js                 # Blockchain network configuration
│   ├── App.jsx                     # Main app component
│   ├── main.jsx                    # Vite entry point
│   ├── index.css                   # Global styles
│   └── globals.js                  # Global utilities & constants
├── public/
│   └── index.html
├── package.json
├── vite.config.js
└── .env.example
```

## Configuration Files

### vite.config.js

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
})
```

### package.json

```json
{
  "name": "certi-chain-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.6.0",
    "ethers": "^6.10.0",
    "lucide-react": "^0.292.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
```

### .env.example

```
VITE_API_URL=http://localhost:5000
VITE_INFURA_KEY=your_infura_key
VITE_PINATA_GATEWAY=https://gateway.pinata.cloud
```

## Core Hooks

### useWallet.js

**Purpose:** Manage MetaMask wallet connection and network switching

```javascript
export function useWallet() {
  // Returns:
  // - account: connected wallet address (null if disconnected)
  // - chainId: current network chainId (11155111 = Sepolia)
  // - isConnecting: boolean (connecting in progress)
  // - isConnected: boolean (wallet connected)
  // - isInitialized: boolean (hook initialized)
  // - connect(): async function to connect wallet
  // - ensureNetwork(targetChainId): switch network if needed
  // - switchNetwork(chainId): request network switch
  // - disconnect(): disconnect wallet

  // Key Implementation:
  // 1. On component mount, check if window.ethereum exists
  // 2. Request eth_accounts to see if already connected
  // 3. Listen to accountsChanged, chainChanged, disconnected events
  // 4. Store account & chainId in state
  // 5. connect() calls wallet_requestPermissions
  // 6. ensureNetwork() compares current chainId and calls wallet_switchEthereumChain if needed
  // 7. Return all state and functions
}
```

### useContract.js

**Purpose:** Interact with smart contracts with FRESH contract data before every transaction

**Critical Implementation:**
- Cache contract info in React useRef (in-memory) with 5-minute TTL
- ALWAYS call `getFreshContractInfo()` before signing transactions
- Clear all cache sources (ref, localStorage, sessionStorage) before fetching fresh data
- Log contract address at every stage for debugging

```javascript
export function useContract() {
  const cacheRef = useRef({});                    // In-memory cache
  const cacheTimestampsRef = useRef({});          // Timestamps for TTL
  const CACHE_TTL_MS = 5 * 60 * 1000;             // 5 minutes

  // getContractInfo(chainId)
  // - If cache valid: return cached data
  // - If cache expired: fetch fresh from /api/contract/info?chainId=
  // - Store in cache with timestamp
  // - Return { certAddress, certAbi, sbtAddress, sbtAbi, chainId }

  // getFreshContractInfo(chainId) - CRITICAL FOR TRANSACTIONS
  // - Log: "[useContract] Fetching FRESH contract info for chainId=${key} (bypassing cache)"
  // - Delete cacheRef.current[key]
  // - Delete cacheTimestampsRef.current[key]
  // - Try: localStorage.removeItem(`contract_${key}`)
  // - Try: sessionStorage.removeItem(`contract_${key}`)
  // - Log: "[useContract] Cleared browser storage for chainId=${key}"
  // - Call getContractInfo(chainId) to fetch fresh
  // - Return fresh contract info

  // issue(chainId, id, studentName, course, orgName, ipfsHash, fileHash)
  // - Call getFreshContractInfo(chainId) to get fresh address & ABI
  // - Log: "[useContract] Signing issue() to contract: ${certAddress} on chainId=${chainId}"
  // - Get signer from MetaMask
  // - Log: "[useContract] Signer: ${signerAddr}"
  // - Create ethers.Contract(certAddress, certAbi, signer)
  // - Call contract.issueCertificate(id, studentName, course, orgName, ipfsHash, fileHash)
  // - Log: "[useContract] Transaction sent: ${tx.hash}, waiting for confirmation..."
  // - Wait for receipt: const receipt = await tx.wait()
  // - Log: "[useContract] Transaction confirmed. Target: ${receipt.to}, Hash: ${tx.hash}"
  // - Return tx.hash

  // batchIssue(chainId, ids[], names[], courses[], orgs[], ipfsHashes[], fileHashes[])
  // - Call getFreshContractInfo(chainId)
  // - Log: "[useContract] Batch size: ${ids.length} certificates"
  // - Log: "[useContract] Signing batchIssueCertificates() to contract: ${certAddress} on chainId=${chainId}"
  // - Get signer from MetaMask
  // - Create contract instance
  // - Call contract.batchIssueCertificates(ids, names, courses, orgs, ipfsHashes, fileHashes)
  // - Log: "[useContract] Batch transaction sent: ${tx.hash}"
  // - Wait for receipt
  // - Log: "[useContract] Batch transaction confirmed. Target: ${receipt.to}, Hash: ${tx.hash}"
  // - Return tx.hash

  // verify(chainId, certId) - Read-only (can use cached info)
  // - Call getContractInfo(chainId) - can use cache, read-only operation
  // - Create contract with read-only provider
  // - Call contract.verifyCertificate(certId)
  // - Return certificate metadata

  // revoke(chainId, certId) - Needs fresh data
  // - Call getFreshContractInfo(chainId)
  // - Get signer, create contract
  // - Call contract.revokeCertificate(certId)
  // - Wait for receipt
  // - Return tx.hash

  // invalidateCache(chainId = null)
  // - If chainId provided: delete cacheRef.current[chainId] & timestamp
  // - If chainId null: clear all caches
  // - Log invalidation

  return {
    getContractInfo,
    getFreshContractInfo,
    issue,
    batchIssue,
    verify,
    revoke,
    invalidateCache,
    getSigner,
    getProvider
  }
}
```

### useAuth.js

**Purpose:** Manage authentication state and JWT tokens

```javascript
export function useAuth() {
  // Returns:
  // - user: { email, role: 'admin'|'student' } or null
  // - isAuthenticated: boolean
  // - isLoading: boolean
  // - login(email): async - request OTP
  // - verifyOTP(email, otp): async - verify OTP, store JWT
  // - logout(): async - clear JWT and logout
  // - register(email, inviteCode): async - admin registration (if needed)

  // Implementation:
  // 1. On mount, check for JWT in cookies or localStorage
  // 2. If JWT exists, decode and set user state
  // 3. login(email) calls POST /api/auth/login with email
  // 4. verifyOTP(email, otp) calls POST /api/auth/verify-otp
  //    - Server returns JWT
  //    - Store JWT in httpOnly cookie (sent by server) or localStorage
  //    - Decode JWT to extract user info
  //    - Set user state
  // 5. logout() calls POST /api/auth/logout
  //    - Clear JWT from storage
  //    - Clear user state
  // 6. Use axios interceptor to add JWT to all requests
}
```

### useToast.js

**Purpose:** Toast notification management

```javascript
export function useToast() {
  // Returns:
  // - toasts: array of { id, message, type: 'success'|'error'|'info' }
  // - showToast(message, type, duration = 3000)
  // - hideToast(id)

  // Implementation:
  // - Store toasts in state
  // - Generate unique ID for each toast
  // - Auto-remove after duration
  // - Provide functions to show/hide manually
}
```

## Key Views

### IssueView.jsx

**Single Certificate Minting:**

```javascript
export default function IssueView() {
  // State:
  // - studentName, course, orgName (form fields)
  // - pdfFile (uploaded file)
  // - aiScore (AI verification score)
  // - transactionHash (after mint)
  // - isLoading, error

  // Flow:
  // 1. User fills form: studentName, course, orgName
  // 2. User uploads PDF certificate
  // 3. Show "AI Guard & Sign Mint (MetaMask)" button
  // 4. On click:
  //    a. Call AI service to verify document
  //    b. Show AI score (should be >70%)
  //    c. Upload PDF to IPFS (Pinata)
  //    d. Get IPFS hash and file hash
  //    e. Call contract.issue() with getFreshContractInfo()
  //    f. Sign in MetaMask
  //    g. Get transaction hash
  //    h. Call POST /api/certificate/record-mint with txHash
  //    i. Show success with certificate ID
  //    j. Redirect to Dashboard

  // Components:
  // - Form inputs for student details
  // - PDF upload & preview
  // - AI Guard loading & score display
  // - MetaMask transaction modal
  // - Success confirmation with cert ID

  // Diagnostics to log:
  // [useContract] Signing issue() to contract: 0x...
  // [useContract] Transaction confirmed. Target: 0x...
}
```

**Batch Certificate Minting:**

```javascript
// Similar flow but:
// 1. Upload multiple PDFs
// 2. Show "Analyze & Review" button
// 3. Analyze each PDF:
//    - Run through AI service for each
//    - Show results in table
//    - Allow filtering by score
// 4. Show "Mint X Reviewed Certificates" button
// 5. On click:
//    - Upload all PDFs to IPFS
//    - Call contract.batchIssueCertificates() with fresh contract info
//    - Sign in MetaMask
//    - Record all in one API call
//    - Show all certificates in table with success status

// Components:
// - Bulk file upload
// - Analysis results table (name, score, status)
// - Filter/sort options
// - Mint all button
// - Success confirmation table
```

### DashboardView.jsx

```javascript
export default function DashboardView() {
  // State:
  // - certificates: array of certificate objects
  // - selectedCert: for viewing details
  // - isLoading, error

  // Flow:
  // 1. On mount, fetch GET /api/certificate/list
  // 2. Display table with columns:
  //    - Certificate ID
  //    - Student Name
  //    - Course
  //    - Organization
  //    - Status (Valid, Revoked)
  //    - AI Score
  //    - Issue Date
  //    - Actions (View, Revoke, Download)
  // 3. Click "View" to show certificate details modal
  //    - Show full metadata
  //    - Show IPFS PDF preview
  //    - Show blockchain transaction link
  //    - Show verification status
  // 4. Click "Revoke" to revoke certificate
  //    - Call contract.revoke(certId) with fresh contract info
  //    - Sign in MetaMask
  //    - Record revocation
  //    - Update table
  // 5. Click "Download" to download IPFS PDF

  // Components:
  // - Certificate table with pagination
  // - Details modal
  // - Revoke confirmation dialog
  // - Filter/search by name, status, date
  // - PDF preview (embedded via IPFS gateway)

  // Admin Features:
  // - Can see all certificates
  // - Can revoke any certificate
  // - Can view student details
}
```

### VerifyView.jsx

```javascript
export default function VerifyView() {
  // State:
  // - certId (search input)
  // - certificate (verification result)
  // - isLoading, error

  // Flow:
  // 1. Show search input for certificate ID
  // 2. On search (no authentication required):
  //    a. Call GET /api/certificate/verify/:certId
  //    b. Backend calls contract.verifyCertificate()
  //    c. Return certificate metadata (if exists and not revoked)
  // 3. Display results:
  //    - Student Name
  //    - Course
  //    - Organization
  //    - Issue Date
  //    - Verification Status (Valid ✓ or Revoked ✗)
  //    - AI Verification Score
  //    - Transaction Hash with Etherscan link
  //    - IPFS PDF preview
  // 4. Show "Not Found" if certificate doesn't exist
  // 5. Show "Certificate Revoked" if revoked

  // Components:
  // - Search input
  // - Results display
  // - IPFS PDF preview
  // - Etherscan transaction link
  // - Status badge (Valid/Revoked)

  // No authentication required - public endpoint
}
```

### ContractDeploy.jsx (Admin Only)

```javascript
export default function ContractDeploy() {
  // State:
  // - selectedChainId (default: Sepolia 11155111)
  // - deploymentStatus (idle, deploying, deployed)
  // - deployedAddresses { certAddress, sbtAddress }
  // - error, loading

  // Flow:
  // 1. Show network selector (Sepolia selected by default)
  // 2. Show "Deploy Contracts from MetaMask" button
  // 3. On click:
  //    a. Fetch artifacts: GET /api/contract/artifact/Certificate
  //    b. Fetch artifacts: GET /api/contract/artifact/SoulboundCertificate
  //    c. Get signer from MetaMask wallet
  //    d. Create contract factories from artifacts
  //    e. Deploy Certificate contract:
  //       - contractFactory.deploy()
  //       - Wait for transaction: tx.wait()
  //       - Extract address from receipt
  //    f. Deploy SoulboundCertificate contract (same flow)
  //    g. Call POST /api/contract/register with:
  //       {
  //         chainId: selectedChainId,
  //         certAddress: deployedCertAddress,
  //         sbtAddress: deployedSbtAddress,
  //         certTxHash: certTx.hash,
  //         sbtTxHash: sbtTx.hash
  //       }
  //    h. Call contract.invalidateCache(chainId) to clear frontend cache
  //    i. Show success with deployed addresses
  //    j. Display "Current Deployment" section showing addresses
  //    k. Show bytecode verification status

  // Components:
  // - Network selector dropdown
  // - Deploy button
  // - Loading state during deployment
  // - Success panel with addresses
  // - Bytecode verification status
  // - Etherscan links to deployed contracts
  // - Current deployment display

  // Key Features:
  // - Verify bytecode exists on chain after deployment
  // - Show live status indicator (green = deployed, gray = not deployed)
  // - Allow re-deployment if needed
  // - Clear frontend cache after deployment
}
```

## API Integration

### api.js

```javascript
import axios from 'axios'

const api = axios.create({
  baseURL: process.env.VITE_API_URL || 'http://localhost:5000',
  withCredentials: true // Include cookies
})

// Request interceptor: add JWT to headers
api.interceptors.request.use(config => {
  // Get JWT from localStorage or cookies
  // Add to Authorization header: "Bearer ${jwt}"
  return config
})

// Response interceptor: handle errors
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // JWT expired or invalid
      // Redirect to login
    }
    return Promise.reject(error)
  }
)

export default api
```

### networks.js

```javascript
const NETWORKS = {
  11155111: {
    name: 'Sepolia',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    chainId: 11155111,
    nativeCurrency: 'ETH',
    blockExplorer: 'https://sepolia.etherscan.io'
  },
  // Add more networks as needed
}

export default NETWORKS
```

## Global Components

### Header.jsx

```javascript
// Display:
// - CertifyChain logo/title on left
// - "Connected: 0x..." (truncated address) in center
// - User role badge (Admin/Student)
// - Logout button on right

// Responsive: Stack on mobile
```

### Navigation.jsx

```javascript
// Tabs:
// - Dashboard (all users)
// - Issue (admin only)
// - Verify (all users - public)
// - Deploy (admin only)
// - Admin (if role === admin)

// Show/hide based on user role
// Highlight active tab
```

### Toast.jsx

```javascript
// Display toast notifications at bottom-right
// Support types: success (green), error (red), info (blue)
// Auto-dismiss after 3 seconds
// Manual dismiss button
// Stack multiple toasts vertically
```

## Authentication Flow

### LoginPage.jsx

```javascript
// Step 1: Email input
// - User enters email
// - Click "Send OTP"
// - API sends OTP to email

// Step 2: OTP input
// - User checks email and gets OTP
// - Enter OTP in form
// - Click "Verify"
// - API verifies OTP and returns JWT

// Step 3: Store JWT
// - Save to localStorage or httpOnly cookie
// - Redirect to Dashboard
// - Set user state with role

// Components:
// - Email input form
// - OTP input form
// - Success message
// - Error handling
// - Loading states
```

## Styling

### Global CSS (index.css)

```css
/* Tailwind CSS or custom CSS */
:root {
  --primary: #3b82f6;      /* Blue */
  --success: #10b981;      /* Green */
  --error: #ef4444;        /* Red */
  --warning: #f59e0b;      /* Amber */
  --text: #1f2937;         /* Dark gray */
  --bg: #ffffff;           /* White */
  --border: #e5e7eb;       /* Light gray */
}

@media (prefers-color-scheme: dark) {
  :root {
    --primary: #60a5fa;
    --text: #f3f4f6;
    --bg: #111827;
    --border: #374151;
  }
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
  color: var(--text);
  background: var(--bg);
  line-height: 1.5;
}

* {
  box-sizing: border-box;
}
```

## Error Handling

```javascript
// Global error handler
// - Log errors to console in dev
// - Show user-friendly toast messages
// - Handle network errors
// - Handle blockchain errors (user rejected, network error, etc.)
// - Redirect to login if JWT expired

const formatError = (error) => {
  if (error.response?.data?.error) {
    return error.response.data.error
  }
  if (error.message === 'User rejected') {
    return 'Transaction cancelled by user'
  }
  if (error.code === 'NETWORK_ERROR') {
    return 'Network error - check your connection'
  }
  return error.message || 'An error occurred'
}
```

## Testing Checklist

### Wallet & Authentication
- [ ] Connect MetaMask wallet
- [ ] Switch to Sepolia testnet
- [ ] Login with email OTP
- [ ] Verify JWT is stored
- [ ] Logout and verify JWT is cleared
- [ ] Try accessing admin pages without admin role (should be denied)

### Contract Interaction
- [ ] Deploy contracts from admin panel
- [ ] Verify deployed addresses displayed
- [ ] Verify bytecode exists on Sepolia (check Etherscan)
- [ ] Issue single certificate
  - [ ] Verify contract address logs show correct address
  - [ ] Sign in MetaMask
  - [ ] Verify transaction on Etherscan shows correct "To" address
  - [ ] Certificate appears in dashboard
- [ ] Issue batch certificates (2+)
  - [ ] Verify batch size logged
  - [ ] Verify contract address logged
  - [ ] All certificates appear in dashboard

### Dashboard & Verification
- [ ] List all issued certificates
- [ ] Filter by name, date, status
- [ ] Click "View" to see details
- [ ] Click "Revoke" to revoke certificate
  - [ ] Verify contract address logs
  - [ ] Verify Etherscan shows revocation transaction
- [ ] Revoked certificate shows "Revoked" status

### Public Verification
- [ ] Enter valid certificate ID
- [ ] Verify certificate details displayed
- [ ] Verify IPFS PDF preview works
- [ ] Verify Etherscan link works
- [ ] Enter invalid certificate ID (show "Not Found")
- [ ] Verify public page accessible without authentication

### Diagnostics
- [ ] Open browser console (F12)
- [ ] Mint certificate and verify logs show:
  - `[useContract] Fetching FRESH contract info...`
  - `[useContract] Cleared browser storage...`
  - `[useContract] Signing issue() to contract: 0x...`
  - `[useContract] Transaction confirmed. Target: 0x...`
- [ ] Verify address is correct: `0x51F9B8800a57055A8530630DD486B85BbC030Fb1` (or whatever deployed)
- [ ] NO logs should show wrong address `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`

### Edge Cases
- [ ] Network disconnection - show error
- [ ] Wallet rejection - show error
- [ ] Insufficient gas - show error
- [ ] Transaction timeout - show error
- [ ] Expired JWT - redirect to login
- [ ] Large batch (50+ certificates) - verify all minted
- [ ] IPFS upload failure - show error and retry

## Performance Optimization

```javascript
// Code splitting with React.lazy
const DashboardView = lazy(() => import('./views/DashboardView'))
const IssueView = lazy(() => import('./views/IssueView'))

// Pagination for large lists
// - Show 20 certificates per page
// - Load more button or infinite scroll

// Memoization for expensive renders
const CertificateTable = memo(({ certificates }) => (...))

// Debounce search/filter inputs
const [searchTerm, setSearchTerm] = useState('')
const debouncedSearch = useCallback(
  debounce(term => fetchCertificates(term), 300),
  []
)
```

## Deployment

```bash
# Build for production
npm run build

# Output: dist/ directory
# Deploy dist/ to static hosting (Vercel, Netlify, AWS S3)

# Environment variables needed in production:
# VITE_API_URL=https://api.certichain.com
# VITE_INFURA_KEY=...
```

## Success Criteria

✅ All pages render correctly
✅ MetaMask integration works (connect, switch networks)
✅ Authentication with email OTP works
✅ Single certificate minting works with correct contract address
✅ Batch certificate minting works
✅ Dashboard displays all certificates
✅ Revocation works
✅ Public verification works (no auth required)
✅ Admin deployment panel works
✅ All diagnostic logs show correct addresses
✅ Error handling shows user-friendly messages
✅ Responsive design works on mobile/tablet/desktop
✅ IPFS PDF preview works
✅ Etherscan links work correctly
✅ No address mismatches in logs
✅ Cache clearing works (fresh contract info before transactions)

## Deliverables

Provide complete, working React SPA with:
1. All source files fully implemented
2. Vite configuration for development and production
3. All hooks (useWallet, useContract, useAuth, useToast) fully functional
4. All views working and tested
5. Complete API integration
6. Comprehensive error handling
7. Diagnostic logging throughout
8. Responsive UI with Tailwind CSS
9. Environment variable templates
10. README with setup and testing instructions
11. No broken imports or missing dependencies
12. Production-ready build configuration
