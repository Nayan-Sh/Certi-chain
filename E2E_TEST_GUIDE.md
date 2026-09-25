# End-to-End Minting Workflow Test Guide

## Summary of Fixes Implemented

1. **Frontend Cache TTL (5 minutes)** - useContract.js now auto-invalidates cache entries after 5 minutes
2. **Manual Cache Invalidation** - Frontend calls `invalidateCache()` after contract deployment
3. **Fresh Contract Info Before Signing** - All write operations use `getFreshContractInfo()` instead of cached data
4. **Backend Strict Validation** - blockchainService.js throws error if no MongoDB contract config (no .env fallback)
5. **Address Normalization** - All addresses normalized to EIP-55 checksummed format

## Pre-Test Checklist

- ✓ Backend running on http://localhost:5000
- ✓ Frontend running on http://localhost:5173
- ✓ MongoDB cleared and ready
- ✓ No stale addresses in environment variables

## Complete Test Workflow

### Step 1: Deploy Certificate Contract

**In Browser:**
1. Open http://localhost:5173
2. Login as admin (use your existing admin account)
3. Navigate to **Admin Panel** → **Deploy Contracts**
4. Click **Deploy Certificate Contract**
5. Approve MetaMask transaction (deploy to Sepolia testnet)
6. Wait for confirmation message

**What Should Happen:**
- Contract deployed to blockchain
- Address stored in MongoDB
- Frontend console: `[useContract] Invalidated cache for chainId=11155111`
- Backend logs: `[Blockchain] ✓ Resolved from MongoDB: certAddress=0x...`

**Expected Backend Log Pattern:**
```
POST /api/contract/register
[Blockchain] Certificate contract deployed at 0xA5dEA0Cc0630314bAF0B12313CfFa018DD71cf5a
[MongoDB] Saved contract config with certAddress=0xA5dEA0Cc0630314bAF0B12313CfFa018DD71cf5a
```

---

### Step 2: Deploy SBT Contract

**In Browser:**
1. Still in **Deploy Contracts** panel
2. Click **Deploy SoulBound Token (SBT) Contract**
3. Approve MetaMask transaction
4. Wait for confirmation

**What Should Happen:**
- SBT contract deployed
- Address stored in MongoDB alongside Certificate contract address
- Frontend console: `[useContract] Invalidated cache for chainId=11155111`
- Backend logs show both addresses normalized

**Critical Verification Points:**
- Check browser console for cache invalidation message
- Verify backend database has BOTH addresses

---

### Step 3: Create and Mint a Test Certificate

**In Browser:**
1. Navigate to **Issue Certificates** → **Issue Single Certificate**
2. Fill in test data:
   - Certificate ID: `TEST-001`
   - Student Name: `Test Student`
   - Course: `Blockchain Fundamentals`
   - Organization: `Test Org`
3. Click **Issue Certificate**
4. **IMPORTANT:** Open browser DevTools Console (F12) BEFORE signing in MetaMask

**Watch Browser Console for:**
```
[useContract] Fetching FRESH contract info for chainId=11155111 (bypassing cache)
[useContract] Fetching fresh contract info for chainId=11155111
[useContract] Cached contract info for chainId=11155111
```

**In MetaMask:**
5. Review transaction
6. Confirm the "to" address matches the registered contract address from Step 1
7. Sign and submit transaction
8. Wait for blockchain confirmation

**Critical Points:**
- The "to" address in MetaMask MUST match the deployed certificate contract address
- Frontend must show `getFreshContractInfo()` calls in console

---

### Step 4: Verify Backend Transaction Validation

**Check Backend Logs for:**
```
POST /api/record-mint
[Blockchain] verifyTxReceipt called with:
  txHash=0x...
  chainId=11155111
  expectedTo=0xA5dEA0Cc0630314bAF0B12313CfFa018DD71cf5a (normalized)
  
[Blockchain] Transaction receipt confirmed on-chain
  receipt.to=0xA5dEA0Cc0630314bAF0B12313CfFa018DD71cf5a (normalized)
  ✓ Address mismatch check PASSED
  ✓ Status check PASSED (status=1)
```

**Critical: This is where the bug was fixed**
- Backend now normalizes BOTH addresses
- No address mismatch error
- Transaction validated successfully

---

### Step 5: Verify Certificate on Blockchain

**In Browser:**
1. Navigate to **Verify Certificates**
2. Enter Certificate ID: `TEST-001`
3. Click **Verify**

**Expected Result:**
```
✓ Certificate found on blockchain
  Student Name: Test Student
  Course: Blockchain Fundamentals
  Organization: Test Org
  Status: VERIFIED
```

**What's Happening Behind the Scenes:**
- Frontend calls `verify()` with cached contract info (read-only, safe to cache)
- Backend calls `verifyOnBlockchain()` 
- Smart contract returns certificate data
- Frontend displays results

---

### Step 6: Test Cache Invalidation After Redeployment

**In Browser:**
1. Go back to **Deploy Contracts**
2. Deploy Certificate Contract again (creates new contract with new address)
3. Watch browser console for: `[useContract] Invalidated cache for chainId=11155111`

**Critical Verification:**
- If you were to mint again now, the frontend MUST use the NEW contract address
- The cache was cleared by the deploy operation
- `getFreshContractInfo()` will fetch the new address from backend

---

## Key Logs to Monitor

### Browser Console (DevTools → Console)
```
[useContract] Cache expired for chainId=11155111 (age: 302s, TTL: 300s)
[useContract] Invalidated cache for chainId=11155111
[useContract] Fetching FRESH contract info for chainId=11155111 (bypassing cache)
```

### Backend Logs (Terminal)
```
[Blockchain] ✓ Resolved from MongoDB: certAddress=0xA5dEA0Cc0630314bAF0B12313CfFa018DD71cf5a
[Blockchain] Address mismatch check PASSED (addresses normalized)
```

### MongoDB Verification
```bash
mongosh certificatesDB
db.contractconfigs.find().pretty()
```

Expected output:
```
{
  "_id": "11155111",
  "certAddress": "0xA5dEA0Cc0630314bAF0B12313CfFa018DD71cf5a",
  "sbtAddress": "0x...",
  "chainId": 11155111,
  "createdAt": "2026-09-25T..."
}
```

---

## Success Criteria

### ✓ Test Passes When:
1. Certificate contract deploys without errors
2. SBT contract deploys without errors
3. Minting transaction targets CORRECT contract address (verified in MetaMask)
4. Backend validates transaction WITHOUT address mismatch error
5. Certificate verified successfully on blockchain
6. Browser console shows cache invalidation messages
7. Backend logs show normalized addresses matching between frontend and backend

### ✗ Test Fails When:
1. "Transaction did not target the registered contract" error appears
2. Address mismatch between MetaMask "to" field and contract address
3. Certificate appears as "NOT VERIFIED" after successful minting
4. Backend logs show different addresses (one checksummed, one not)
5. No cache invalidation messages in console after deployment

---

## Debugging If Issues Occur

### Issue: "Transaction did not target the registered contract"
**Root Cause:** Frontend and backend contract addresses don't match
**Debug Steps:**
1. Check browser console for `getFreshContractInfo()` calls
2. Check backend logs for the expected vs. actual addresses
3. Verify MongoDB has the correct contract address:
   ```bash
   mongosh certificatesDB --eval "db.contractconfigs.findOne().certAddress"
   ```
4. Check if addresses are normalized (should start with 0x and be checksummed)

### Issue: Certificate shows "NOT VERIFIED"
**Root Cause:** Certificate data mismatch or blockchain verification failure
**Debug Steps:**
1. Check backend logs for `verifyOnBlockchain()` call
2. Verify certificate exists in MongoDB
3. Check blockchain explorer (Sepolia) for transaction receipt
4. Verify the certificate ID matches what was minted

### Issue: Cache Not Invalidating
**Root Cause:** Frontend didn't receive cache invalidation message
**Debug Steps:**
1. Open browser DevTools
2. Check Network tab for `/api/contract/register` response
3. Verify frontend console shows invalidation message
4. Check if JavaScript error occurred in console

---

## Timeline

Each step should take approximately:
- Deploy Certificate: 30-60 seconds
- Deploy SBT: 30-60 seconds
- Mint Certificate: 45-90 seconds
- Verify Certificate: 5-10 seconds

**Total Time:** Approximately 3-5 minutes for complete workflow
