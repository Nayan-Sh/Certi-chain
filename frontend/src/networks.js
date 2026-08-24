// ── Supported blockchain networks ────────────────────────────────────────────
// Mirrors backend/config/networks.js so the frontend can prompt MetaMask to
// switch or add networks without depending on the backend for chain metadata.
// Chain IDs are decimal (matching MetaMask's chainId and ethers.js).

const NETWORKS = {
    11155111: {
        name: "Sepolia",
        chainId: 11155111,
        chainIdHex: "0xaa36a7",
        rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
        nativeCurrency: { name: "Sepolia ETH", symbol: "SepETH", decimals: 18 },
        blockExplorerUrls: ["https://sepolia.etherscan.io"],
    },
};

export default NETWORKS;