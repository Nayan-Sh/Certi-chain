import { useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import api from '../api';

/**
 * MetaMask-signed contract interactions — the frontend's interface to all
 * on-chain writes. The backend never holds a private key; all transaction
 * gas comes from the connected wallet (admin or student).
 *
 * Contract address + ABI are fetched from GET /api/contract/info?chainId=
 * and cached in memory with automatic TTL and manual invalidation.
 */
export function useContract() {
    const cacheRef = useRef({});
    const cacheTimestampsRef = useRef({});
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes auto-invalidation

    /**
     * Check if cache is still valid (not expired).
     */
    const isCacheValid = useCallback((chainId) => {
        const key = Number(chainId);
        const cached = cacheRef.current[key];
        const cachedAt = cacheTimestampsRef.current[key];

        if (!cached || !cachedAt) return false;

        const age = Date.now() - cachedAt;
        const isValid = age < CACHE_TTL_MS;

        if (!isValid) {
            console.log(`[useContract] Cache expired for chainId=${key} (age: ${Math.round(age / 1000)}s, TTL: ${Math.round(CACHE_TTL_MS / 1000)}s)`);
        }

        return isValid;
    }, []);

    /**
     * Fetch contract addresses + ABIs for the target chain.
     * Uses memory cache with 5-minute TTL.
     * Call getFreshContractInfo() before signing to bypass cache.
     */
    const getContractInfo = useCallback(async (chainId) => {
        const key = Number(chainId);

        // Return cached if valid
        if (isCacheValid(key)) {
            console.log(`[useContract] Using cached contract info for chainId=${key}`);
            return cacheRef.current[key];
        }

        console.log(`[useContract] Fetching fresh contract info for chainId=${key}`);
        try {
            const res = await api.get(`/api/contract/info?chainId=${key}`);
            const info = res.data;
            if (!info.certAddress) {
                throw new Error(
                    `Contracts not deployed on this network (chain ${key}). Open the Deploy Contracts panel and deploy first.`
                );
            }

            // Store in cache with timestamp
            cacheRef.current[key] = info;
            cacheTimestampsRef.current[key] = Date.now();
            console.log(`[useContract] Cached contract info for chainId=${key}`);

            return info;
        } catch (err) {
            console.error(`[useContract] Error fetching contract info:`, err);
            if (err.response?.status === 404) {
                throw new Error(`No contracts deployed on chain ${key}. Please deploy contracts first.`);
            } else if (err.response?.status === 500) {
                throw new Error(`Server error while fetching contract info. Please try again.`);
            } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                throw new Error(`Network timeout fetching contract info. Check your connection and try again.`);
            } else if (!err.response) {
                throw new Error(`Network error: ${err.message}. Please check your internet connection.`);
            }
            throw err;
        }
    }, [isCacheValid]);

    /**
     * Fetch fresh contract info bypassing the cache.
     * ALWAYS call this immediately before signing transactions.
     */
    const getFreshContractInfo = useCallback(async (chainId) => {
        const key = Number(chainId);
        console.log(`[useContract] Fetching FRESH contract info for chainId=${key} (bypassing cache)`);

        // Clear ALL cache sources for this chain
        delete cacheRef.current[key];
        delete cacheTimestampsRef.current[key];

        // Also clear browser storage to ensure no stale data
        try {
            localStorage.removeItem(`contract_${key}`);
            sessionStorage.removeItem(`contract_${key}`);
            console.log(`[useContract] Cleared browser storage for chainId=${key}`);
        } catch (e) {
            console.warn(`[useContract] Could not clear browser storage: ${e.message}`);
        }

        // Fetch fresh data
        return getContractInfo(chainId);
    }, [getContractInfo]);

    /**
     * Invalidate the cache for a specific chainId or all chains.
     * Call this after deploying/redeploying contracts.
     */
    const invalidateCache = useCallback((chainId = null) => {
        if (chainId !== null) {
            const key = Number(chainId);
            delete cacheRef.current[key];
            delete cacheTimestampsRef.current[key];
            console.log(`[useContract] ✓ Invalidated cache for chainId=${key}`);
        } else {
            cacheRef.current = {};
            cacheTimestampsRef.current = {};
            console.log(`[useContract] ✓ Invalidated ALL caches`);
        }
    }, []);

    const getSigner = async (expectedChainId) => {
        if (!window.ethereum) throw new Error('MetaMask is not installed');
        const provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        if (expectedChainId && Number(network.chainId) !== Number(expectedChainId)) {
            throw new Error(`MetaMask is connected to chain ${network.chainId}, but this contract is registered on chain ${expectedChainId}. Switch networks and try again.`);
        }
        return provider.getSigner();
    };

    function formatContractError(err) {
        if (!err) return 'Transaction failed';
        if (err.code === 'ACTION_REJECTED' || err.code === 4001 || (err.message && err.message.includes('user rejected'))) {
            return 'Transaction was cancelled or rejected in MetaMask.';
        }
        if (err.code === 'INSUFFICIENT_FUNDS' || (err.message && err.message.includes('insufficient funds'))) {
            return 'Insufficient funds in your wallet to cover network gas fees.';
        }
        if (err.reason) {
            return err.reason;
        }
        if (err.message && err.message.includes('OwnableUnauthorizedAccount')) {
            return 'Access denied: Only the contract owner (admin deployer wallet) can execute this action.';
        }
        if (err.message && err.message.includes('Certificate not found')) {
            return 'Certificate not found on this smart contract.';
        }
        if (err.message && err.message.includes('Certificate already issued')) {
            return 'A certificate with this ID has already been issued on the blockchain.';
        }
        if (err.message && err.message.includes('Certificate already revoked')) {
            return 'This certificate has already been revoked on the blockchain.';
        }
        if (err.shortMessage) {
            return err.shortMessage;
        }
        return err.message || 'Smart contract execution failed.';
    }

    // ── Issue ──────────────────────────────────────────────────────────────

    const issue = async (chainId, id, studentName, course, orgName, ipfsHash, fileHash) => {
        try {
            // Use FRESH contract info immediately before signing
            const { certAddress, certAbi } = await getFreshContractInfo(chainId);
            console.log(`[useContract] Signing issue() to contract: ${certAddress} on chainId=${chainId}`);
            const signer = await getSigner(chainId);
            const signerAddr = await signer.getAddress();
            console.log(`[useContract] Signer: ${signerAddr}`);
            const contract = new ethers.Contract(certAddress, certAbi, signer);
            const tx = await contract.issueCertificate(
                id, studentName, course, orgName, ipfsHash, fileHash
            );
            console.log(`[useContract] Transaction sent: ${tx.hash}, waiting for confirmation...`);
            const receipt = await tx.wait();
            console.log(`[useContract] Transaction confirmed. Target: ${receipt.to}, Hash: ${tx.hash}`);
            return tx.hash;
        } catch (err) {
            throw new Error(formatContractError(err));
        }
    };

    const batchIssue = async (chainId, ids, names, courses, orgs, ipfsHashes, fileHashes) => {
        try {
            // Use FRESH contract info immediately before signing
            const { certAddress, certAbi } = await getFreshContractInfo(chainId);
            console.log(`[useContract] Signing batchIssueCertificates() to contract: ${certAddress} on chainId=${chainId}`);
            console.log(`[useContract] Batch size: ${ids.length} certificates`);
            const signer = await getSigner(chainId);
            const signerAddr = await signer.getAddress();
            console.log(`[useContract] Signer: ${signerAddr}`);
            const contract = new ethers.Contract(certAddress, certAbi, signer);
            const tx = await contract.batchIssueCertificates(
                ids, names, courses, orgs, ipfsHashes, fileHashes
            );
            console.log(`[useContract] Batch transaction sent: ${tx.hash}, waiting for confirmation...`);
            const receipt = await tx.wait();
            console.log(`[useContract] Batch transaction confirmed. Target: ${receipt.to}, Hash: ${tx.hash}`);
            return tx.hash;
        } catch (err) {
            throw new Error(formatContractError(err));
        }
    };

    // ── Revoke ─────────────────────────────────────────────────────────────

    const verify = async (chainId, certId) => {
        try {
            // Can use cached info for read-only verification
            const { certAddress, certAbi } = await getContractInfo(chainId);
            const provider = new ethers.BrowserProvider(window.ethereum);
            const contract = new ethers.Contract(certAddress, certAbi, provider);
            const result = await contract.verifyCertificate(certId);
            return {
                studentName: result.studentName,
                course: result.course,
                orgName: result.orgName,
                ipfsHash: result.ipfsHash,
                fileHash: result.fileHash,
                exists: result.exists,
                revoked: result.revoked
            };
        } catch (err) {
            throw new Error(formatContractError(err));
        }
    };

    const revoke = async (chainId, certId) => {
        try {
            // Use FRESH contract info immediately before signing
            const { certAddress, certAbi } = await getFreshContractInfo(chainId);
            const signer = await getSigner(chainId);
            const contract = new ethers.Contract(certAddress, certAbi, signer);
            const tx = await contract.revokeCertificate(certId);
            await tx.wait();
            return tx.hash;
        } catch (err) {
            throw new Error(formatContractError(err));
        }
    };

    // ── SBT claim ──────────────────────────────────────────────────────────

    const issueSBT = async (chainId, studentAddress, certId, ipfsHash) => {
        try {
            // Use FRESH contract info immediately before signing
            const { sbtAddress, sbtAbi } = await getFreshContractInfo(chainId);
            const signer = await getSigner(chainId);
            const contract = new ethers.Contract(sbtAddress, sbtAbi, signer);
            const uri = `ipfs://${ipfsHash}`;
            const tx = await contract.issueSBT(studentAddress, certId, uri);
            await tx.wait();
            return tx.hash;
        } catch (err) {
            throw new Error(formatContractError(err));
        }
    };

    return {
        getContractInfo,
        getFreshContractInfo,
        getSigner,
        issue,
        batchIssue,
        verify,
        revoke,
        issueSBT,
        invalidateCache
    };
}
