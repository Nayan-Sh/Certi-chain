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
    31337: {
        name: "Hardhat Localhost",
        chainId: 31337,
        chainIdHex: "0x7a69",
        rpcUrl: "http://127.0.0.1:8545",
        nativeCurrency: { name: "Hardhat ETH", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: ["http://127.0.0.1:8545"],
    },
    1337: {
        name: "Localhost 1337",
        chainId: 1337,
        chainIdHex: "0x539",
        rpcUrl: "http://127.0.0.1:8545",
        nativeCurrency: { name: "Local ETH", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: ["http://127.0.0.1:8545"],
    },
};