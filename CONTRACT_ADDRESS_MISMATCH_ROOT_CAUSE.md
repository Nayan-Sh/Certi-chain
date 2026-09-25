# Contract Address Mismatch - Root Cause Analysis & Fix

## Problem Statement
Certificate minting fails with address mismatch:
- **Expected (Registered):** `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`
- **Actual (Transaction):** `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`

## Root Causes Identified

### 1. **Frontend Cache Timing Issue** (PRIMARY)
- **File:** `frontend/src/hooks/useContract.js`
- **Issue:** The `getContractInfo()` function caches contract addresses for 5 minutes
- **Problem:** If the cache is populated BEFORE the contract is registered in MongoDB, the frontend caches a stale/undefined address
- **Flow:** 
  1. Frontend calls `getContractInfo(chainId)` → cache miss
  2. Fetches from `/api/contract/info?chainId=`
  3. MongoDB has no ContractConfig entry yet
  4. Backend throws error, but cache may still hold stale data
  5. Next minting attempt uses cached stale address

### 2. **Backend Fallback Logic** (SECONDARY)
- **File:** `backend/services/blockchainService.js` lines 25-49
- **Issue:** When no ContractConfig exists in MongoDB, backend should fail hard, but old `.env` fallback may exist
- **Current:** Lines 47-48 throw error: "No contracts deployed for chainId"
- **Risk:** If `.env` has old CONTRACT_ADDRESS from previous deployment, it could be used as fallback

### 3. **Verification Mismatch** (TERTIARY)
- **File:** `backend/controllers/certificateController.js` line 345-346
- **Issue:** `recordMint()` calls `getCertificateContractInfo(chainId)` AFTER frontend has already signed
- **Problem:** If registered address differs from what frontend used, `verifyTxReceipt()` fails
- **Flow:**
  1. Frontend signs transaction to address X (from cache/stale)
  2. MetaMask confirms to address X
  3. Transaction succeeds on-chain at address X
  4. Backend calls `recordMint()` with txHash
  5. Backend fetches current registered address (different from X)
  6. `verifyTxReceipt()` compares receipt.to (X) vs expected (different) → MISMATCH ERROR

## Fix Strategy

### Step 1: Clean Up Contract Address Configuration
- Remove stale `.env` entries in `backend/.env` (CONTRACT_ADDRESS, SBT_CONTRACT_ADDRESS)
- Ensure MongoDB is the ONLY source of truth

### Step 2: Force Fresh Contract Info Before Signing
- Modify `useContract.js` to ALWAYS call `getFreshContractInfo()` before minting (not just cached version)
- Add explicit chainId verification before signing

### Step 3: Strengthen Backend Verification
- Ensure `recordMint()` gets contract address from SAME source as frontend
- Add pre-flight check that transaction target matches registered contract

### Step 4: Add Diagnostic Logging
- Log contract address used at each stage (fetch, cache, sign, verify)
- Log transaction receipt details including `to` and `from` fields

## Files to Modify

1. **`backend/.env`**
   - Clear: `CONTRACT_ADDRESS=`
   - Clear: `SBT_CONTRACT_ADDRESS=`

2. **`frontend/src/hooks/useContract.js`**
   - Issue: Always use `getFreshContractInfo()` before signing (already has this pattern)
   - Enhance: Add explicit verification that chainId matches MetaMask

3. **`backend/services/blockchainService.js`**
   - CRITICAL: Remove any fallback to `.env` values
   - Ensure `getRegisteredAddresses()` only reads MongoDB (line 48 already throws, good)

4. **`frontend/src/views/IssueView.jsx`**
   - Line 131, 223, 581: Already calls `contract.getContractInfo(wallet.chainId)` ✓
   - Enhancement: Log the address before signing

5. **`frontend/src/ContractDeploy.jsx`**
   - Line 169-175: Already registers addresses with backend ✓
   - Enhancement: Invalidate cache after registration

## Implementation Order

1. ✓ Audit current deployment state (which address is registered?)
2. ✓ Read contract bytecode from both addresses to determine which is live
3. Delete stale `.env` entries
4. Update frontend to use fresh contract info on every mint
5. Verify transaction targets match registered address
6. Test end-to-end mint flow
7. Verify transaction on chain explorer
