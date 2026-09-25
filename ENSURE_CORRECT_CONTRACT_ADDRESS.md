# Ensure Certificates are Minted to Correct Contract Address

## Objective
Ensure all certificate minting transactions target **ONLY** the correct contract:
```
0x51F9B8800a57055A8530630DD486B85BbC030Fb1
```

NOT the mismatched address:
```
0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
```

## Step 1: Verify MongoDB Has ONLY the Correct Address

### Connect to MongoDB
```bash
# In a terminal:
mongosh
```

### Check for old/wrong address and delete it
```javascript
// Show all contract configs
db.contractconfigs.find().pretty()

// If you see the wrong address (0xdb9B1e94...), DELETE IT:
db.contractconfigs.deleteMany({ 
  certAddress: "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" 
})

// Verify it's deleted:
db.contractconfigs.find().pretty()
```

### Verify correct address is registered
```javascript
// Should show ONLY:
{
  _id: "11155111",
  certAddress: "0x51F9B8800a57055A8530630DD486B85BbC030Fb1",
  sbtAddress: "0x...",
  chainId: 11155111,
  deployedBy: "admin@...",
  deployedAt: ISODate(...),
  ...
}
```

**IF YOU DON'T SEE THIS ADDRESS**: The contracts haven't been deployed yet. Go to Step 3 below.

## Step 2: Clear Frontend Cache

The frontend caches contract addresses in memory. Clear it by:

### Option A: Restart Frontend (Recommended)
```bash
# In frontend terminal:
Ctrl+C  # Stop the running dev server

npm run dev  # Restart (clears in-memory cache)
```

### Option B: Clear Browser Cache
1. Open DevTools (F12)
2. Go to **Storage** tab
3. Click **Storage** → **Session Storage**
4. Right-click `http://localhost:5173` and select **Delete All**
5. Go to **Storage** → **Local Storage**
6. Right-click `http://localhost:5173` and select **Delete All**
7. Reload the page

## Step 3: Deploy Contracts (If Not Already Deployed)

### In Browser (Admin Panel)
1. Navigate to **Deploy Smart Contracts** tab
2. Ensure **Sepolia** is selected in the network dropdown
3. Click **Deploy Contracts from MetaMask**
4. Sign **2 transactions** in MetaMask:
   - Certificate contract
   - Soulbound NFT (SBT) contract

### Verify Deployment Success
- Success panel shows: `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`
- MongoDB shows same address (see Step 1)

## Step 4: Verify Contract Exists on Chain

### In Browser Console
```javascript
// Verify the contract actually exists with bytecode
const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const code = await provider.getCode('0x51F9B8800a57055A8530630DD486B85BbC030Fb1');
console.log(code !== '0x' ? '✓ Contract exists on Sepolia' : '✗ No contract at this address');
```

**Expected output:** `✓ Contract exists on Sepolia`

If you see `✗ No contract at this address`, the deployment failed. Re-deploy in Step 3.

## Step 5: Mint a Test Certificate

### Upload and Mint
1. Go to **Issue** tab
2. Fill in details:
   - Student Name: "Test Student"
   - Course: "Test Course"
   - Organization: "Test Org"
3. Upload a test PDF certificate
4. Click **AI Guard & Sign Mint (MetaMask)**
5. Sign the transaction in MetaMask

### Monitor Logs (CRITICAL)

**Open DevTools Console (F12)** and watch for these logs:

```
✓ [useContract] Signing issue() to contract: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1 on chainId=11155111
✓ [useContract] Signer: 0x[admin-wallet-address]
✓ [useContract] Transaction sent: 0x[txhash]
✓ [useContract] Transaction confirmed. Target: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1, Hash: 0x[txhash]
```

**Open Backend Terminal** and watch for these logs:

```
✓ [Record Mint] Verifying 1 certificates. txHash=0x[txhash], chainId=11155111, admin=0x[admin]
✓ [Record Mint] Expected contract address: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1
✓ [Blockchain] verifyTxReceipt: txHash=0x[txhash], chainId=11155111, expectedTo=0x51F9B8800a57055A8530630DD486B85BbC030Fb1, expectedFrom=0x[admin]
✓ [Blockchain] Receipt details: to=0x51F9B8800a57055A8530630DD486B85BbC030Fb1, from=0x[admin], gasUsed=..., blockNumber=...
✓ [Blockchain] ✓ Receipt verified: transaction successfully targeted contract 0x51F9B8800a57055A8530630DD486B85BbC030Fb1
✓ [Record Mint] ✓ Transaction verified successfully against contract 0x51F9B8800a57055A8530630DD486B85BbC030Fb1
```

## ⚠️ CRITICAL: What to Check

### ALL logs must show THIS address:
```
0x51F9B8800a57055A8530630DD486B85BbC030Fb1
```

### If you see THIS address ANYWHERE:
```
0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
```

**STOP! Something is wrong.**

**Fix:**
1. Delete wrong address from MongoDB (Step 1)
2. Clear browser cache (Step 2)
3. Restart frontend (Step 2A)
4. Re-deploy contracts (Step 3)
5. Try again (Step 5)

## Step 6: Verify Transaction on Etherscan

### Get Transaction Hash
- Copy txHash from success message in UI, or
- Look at backend logs for `txHash=0x...`

### Check on Chain
1. Go to: `https://sepolia.etherscan.io/tx/{txHash}`
2. Verify **To** field shows: `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`
3. Verify **From** field shows your admin wallet address

**Example:**
```
To: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1 ✓
From: 0x123456789... ✓
Status: Success ✓
```

## Step 7: Verify Certificate in Dashboard

1. Go to **Dashboard** tab
2. Verify certificate appears with:
   - Certificate ID (e.g., "CERT-2026-000001")
   - Student Name: "Test Student"
   - Status: ✓ Valid
   - AI Score: High (>70%)

## Step 8: Test Batch Minting

Repeat Steps 5-7 but with **batch upload**:

1. Go to **Issue** → **Bulk Upload (PDFs)**
2. Upload 2-3 test PDF certificates
3. Click **Analyze & Review**
4. Wait for AI analysis
5. Click **Mint X Reviewed Certificates**
6. Watch logs for same pattern with `batchIssueCertificates`:

```
✓ [useContract] Batch size: X certificates
✓ [useContract] Signing batchIssueCertificates() to contract: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1
✓ [useContract] Batch transaction confirmed. Target: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1
```

7. Verify all X certificates appear in dashboard

## Complete Verification Checklist

- [ ] MongoDB ContractConfig shows: `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`
- [ ] No entries with `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` in MongoDB
- [ ] Frontend restarted (cache cleared)
- [ ] Contracts deployed and visible in "Current Deployment" panel
- [ ] Contract bytecode exists on Sepolia RPC
- [ ] Single certificate minted
- [ ] ALL frontend logs show correct address
- [ ] ALL backend logs show correct address
- [ ] NO logs show wrong address
- [ ] Etherscan shows transaction targeted correct address
- [ ] Certificate appears in dashboard
- [ ] Batch minting tested with same results

## If Anything Goes Wrong

### Wrong address still appears in logs?
1. **MongoDB has wrong entry**: Delete it (Step 1)
2. **Frontend cache not cleared**: Restart frontend (Step 2A)
3. **Contracts not redeployed**: Deploy fresh (Step 3)

### Transaction fails with "ADDRESS MISMATCH"?
```
Error: Transaction did not target the registered contract. 
Expected: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1, 
Got: 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
```

**This means:**
1. Frontend cached old address before new deployment
2. Backend registered new address
3. Frontend tried to use cached old address

**Fix:**
1. Verify MongoDB has ONLY correct address
2. Stop frontend (`Ctrl+C`)
3. Restart frontend (`npm run dev`)
4. Try minting again

## Success Criteria

✅ **Correct** when:
- All 4 stages show: `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`
- Etherscan confirms transaction "To" = `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`
- Certificate appears in dashboard
- No errors in any logs

✅ **Verified Complete** when:
- Single certificate minted to correct address
- Batch certificates minted to correct address
- All certificates visible in dashboard
- All verified on Etherscan

## Summary

The diagnostic logging I've implemented makes it **crystal clear** which address is being used at every stage:

1. **Frontend**: Logs when it fetches fresh contract info and what address it's using
2. **Transaction**: Logs confirm the target address in the receipt
3. **Backend**: Logs show what address it expects and what the receipt shows
4. **Verification**: Clear error if they don't match, success confirmation if they do

**No certificate will be minted to the wrong address.** The system will fail with clear diagnostic logs before it ever records a mint to the wrong address.
