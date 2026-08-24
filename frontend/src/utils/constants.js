// ── Frontend Constants ──────────────────────────────────────────────────────────
// Centralized constants for API endpoints and network configurations

// API base URL for certificate endpoints
export const API = import.meta.env.VITE_API_URL || '/api/certificates';

// Network configurations (mirrors backend/config/networks.js)
export const NETWORKS = {
    11155111: {
        name: "Sepolia",
        chainId: 11155111,
        chainIdHex: "0xaa36a7",
        rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
        nativeCurrency: { name: "Sepolia ETH", symbol: "SepETH", decimals: 18 },
        blockExplorerUrls: ["https://sepolia.etherscan.io"],
    },
};