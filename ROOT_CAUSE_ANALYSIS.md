# ROOT CAUSE ANALYSIS: "Transaction did not target the registered contract"

## Error Location
- **File**: `backend/services/blockchainService.js`
- **Line**: 134
- **Function**: `verifyTxReceipt()`
- **Error**: "Transaction did not target the registered contract."

## Complete Flow Analysis

### Frontend → Backend Flow for Minting:
1. Frontend calls `getContractInfo(chainId)` → Gets `certAddress` from `GET /api/contract/info?chainId=X`
2. Frontend caches this address in `cacheRef.current[key]`
3. Frontend creates ethers.Contract instance with cached `certAddress`
4. Frontend signs transaction targeting this address via MetaMask
5. Frontend sends `txHash` to backend via `POST /api/record-mint`

### Backend Verification Flow:
1. Backend receives `{ txHash, chainId, adminAddress, records }`
2. Backend calls `getCertificateContractInfo(chainId)` to get expected contract address
3. Backend calls `verifyTxReceipt(txHash, chainId, certAddress, adminAddress)`
4. `verifyTxReceipt()` fetches transaction receipt from blockchain
5. `verifyTxReceipt()` compares:
   - `receipt.to` (actual contract address from blockchain transaction)
   - `expectedTo` (certAddress from backend)
6. If mismatch → ERROR "Transaction did not target the registered contract."

## Root Cause Identification

### Potential Mismatch Sources:

1. **Address Format Inconsistency**:
   - Frontend address may NOT be checksummed
   - Backend address IS checksummed (line 62: `ethers.getAddress(address)`)
   - Comparison at line 132 compares checksummed addresses
   - If frontend used non-checksummed address, it WON'T match

2. **Address Retrieval Difference**:
   - Frontend gets address from `/api/contract/info` endpoint (line 88-108 in contractRoutes.js)
   - Backend gets address from `getCertificateContractInfo(chainId)` (line 51-63 in blockchainService.js)
   - Both call `getRegisteredAddresses(chainId)` eventually
   - But CONTRACT ROUTES endpoint returns address as-is from database (NOT normalized)
   - BLOCKCHAIN SERVICE returns address NORMALIZED via `ethers.getAddress()` (line 62)

3. **The Actual Problem**:
   - `contractRoutes.js` line 99: Returns `certAddress: certInfo.address` (normalized via getCertificateContractInfo)
   - BUT: Frontend caches this address for multiple calls
   - Meanwhile backend ALWAYS normalizes when comparing in verifyTxReceipt()
   - If cached address is not checksummed, but blockchain receipt.to IS checksummed:
     - Frontend signs with non-checksummed address
     - MetaMask tx targets non-checksummed address
     - receipt.to from blockchain IS checksummed
     - Backend normalizes both and compares
     - They SHOULD match... unless frontend got non-normalized address

## Actual Root Cause

The frontend's contract info endpoint returns NORMALIZED addresses, but there's a potential issue:
- If MongoDB stores non-checksummed addresses, but backend normalizes them for verification
- Frontend gets the address from the endpoint and uses it as-is
- If frontend caches BEFORE normalization happens, or if normalization is inconsistent

**CRITICAL ISSUE**: The contractRoutes.js endpoint (line 99) returns addresses from `getCertificateContractInfo()` which ARE normalized. But the frontend uses these in MetaMask which may or may not preserve checksumming when creating the transaction.

**VERIFICATION NEEDED**:
1. Check if addresses in MongoDB are checksummed or not
2. Check if frontend address matches backend address exactly
3. Check if ethers.Contract() in frontend preserves address format
4. Check if receipt.to from blockchain is checksummed
