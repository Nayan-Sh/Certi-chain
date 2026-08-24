# CertifyChain — Frontend

React 19 + Vite + Tailwind frontend for the certificate verification system. All blockchain writes are signed by the user's MetaMask wallet in the browser.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api to the backend on :5000)
```

## Key source files

| File | Purpose |
|---|---|
| `src/App.jsx` | Main app, routing, and the mint / verify / revoke / SBT flows |
| `src/ContractDeploy.jsx` | Admin panel that deploys contracts from MetaMask and registers addresses per-network |
| `src/networks.js` | Chain metadata (Hardhat / Sepolia) for MetaMask switch/add |
| `src/hooks/useWallet.js` | Shared wallet connection + `ensureNetwork()` |
| `src/hooks/useContract.js` | Wallet-signed contract calls (`issue`, `batchIssue`, `revoke`, `issueSBT`) |
| `src/api.js` | Axios client with JWT interceptor |

## Env

Optional — `VITE_API_URL` overrides the backend URL (default `http://localhost:5000`). See `.env.example`.

See the [root README](../README.md) for full setup, wallet, and network instructions.
