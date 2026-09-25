# Deployment Verification Checklist

## Expected Deployed Contract Address
**Certificate Contract:** `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`

## Steps to Ensure Correct Address is Used

### 1. MongoDB ContractConfig Must Have This Address
```bash
# Connect to MongoDB and verify:
db.contractconfigs.findOne()
# Should show:
# {
#   _id: "11155111",
#   certAddress: "0x51F9B8800a57055A8530630DD486B85BbC030Fb1",
#   sbtAddress: "0x...",
#   chainId: 11155111,
#   ...
# }
```

### 2. Frontend Must Fetch Fresh Contract Info Before Minting
- Frontend calls `getFreshContractInfo(chainId)` immediately before signing
- This bypasses the 5-minute cache and fetches fresh from MongoDB
- Log to verify: `[useContract] Signing issue() to contract: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1`

### 3. Transaction Receipt Must Target This Address
- After signing in MetaMask, the transaction.to field must be: `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`
- Log to verify: `[useContract] Transaction confirmed. Target: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1`

### 4. Backend Must Verify Against This Address
- Backend fetches registered address from MongoDB
- Compares transaction receipt.to against this address
- Log to verify: `[Record Mint] Expected contract address: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1`
- Log to verify: `[Blockchain] ✓ Receipt verified: transaction successfully targeted contract 0x51F9B8800a57055A8530630DD486B85BbC030Fb1`

## Complete Verification Flow

1. **Deploy Contracts (Admin Panel)**
   - Click "Deploy Contracts from MetaMask"
   - Verify success panel shows: `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`
   - Verify MongoDB has this address

2. **Mint Certificate**
   - Go to Issue tab
   - Upload certificate PDF
   - Click "AI Guard & Sign Mint"
   - Watch browser console logs
   - Sign in MetaMask

3. **Verify Logs Show Correct Address**
   ```
   ✓ Frontend logs show: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1
   ✓ Transaction target: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1
   ✓ Backend expected: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1
   ✓ Receipt verified: 0x51F9B8800a57055A8530630DD486B85BbC030Fb1
   ```

4. **Verify on Chain**
   - Get txHash from success message
   - Go to https://sepolia.etherscan.io/tx/{txHash}
   - Verify "To" field = `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`

## If Wrong Address (0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3) Appears

1. **Delete Wrong Contract from MongoDB**
   ```bash
   db.contractconfigs.deleteMany({ certAddress: "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" })
   ```

2. **Clear Browser Cache**
   - DevTools → Storage → Clear everything for localhost:5173

3. **Restart Frontend**
   - Ctrl+C to stop `npm run dev`
   - `npm run dev` to restart (clears in-memory cache)

4. **Re-deploy Contracts**
   - Admin Panel → Deploy Smart Contracts
   - Select Sepolia
   - Click Deploy (will generate fresh contract at correct address)
   - Verify MongoDB shows: `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`

5. **Mint Test Certificate**
   - Verify all logs show: `0x51F9B8800a57055A8530630DD486B85BbC030Fb1`
   - Verify transaction on Etherscan targets correct address

## Key Points

- **MongoDB is the source of truth** for contract addresses
- **Frontend must fetch fresh before signing** to bypass cache
- **All logs must show same address** throughout the pipeline
- **Transaction receipt.to must match registered address** or mint fails
- **No .env fallbacks** — only MongoDB

If you see `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` anywhere in the logs, it means:
1. MongoDB has the wrong address, OR
2. Frontend cache is stale, OR  
3. Something is using old contract from previous deployment

The diagnostic logs I've added will make this immediately obvious.
