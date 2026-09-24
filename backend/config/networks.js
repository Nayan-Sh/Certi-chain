// ── Supported blockchain networks ────────────────────────────────────────────
// Every read-only chain interaction (verification, receipt checks) resolves the
// RPC from this map by chainId. The frontend signs transactions with MetaMask,
// which talks to whatever network the admin has connected to, so the backend
// only needs these RPC URLs for *reads* (verify / getTransactionReceipt).
//
// RPC values can be overridden per-network via backend/.env:
//   SEPOLIA_RPC_URL
//
// The chainId keys are decimal integers (the value ethers/MetaMask report):
//   11155111 Ethereum Sepolia testnet (default for real use)
const NETWORKS = {
    11155111: {
        name: "Sepolia",
        chainId: 11155111,
        rpc: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
        symbol: "SepETH",
        blockExplorer: "https://sepolia.etherscan.io",
    },
};

/**
 * Resolve a network entry by chainId. Unknown chain IDs are rejected
 * instead of silently falling back to Sepolia.
 * @param {number|string} chainId
 */
function getNetwork(chainId) {
    const id = Number(chainId);
    const net = NETWORKS[id];
    if (!net) {
        throw new Error(`Unsupported network: ${chainId}`);
    }
    return net;
}

module.exports = { NETWORKS, getNetwork };