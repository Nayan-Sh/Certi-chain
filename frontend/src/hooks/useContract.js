import { useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import api from '../api';

/**
 * MetaMask-signed contract interactions — the frontend's interface to all
 * on-chain writes. The backend never holds a private key; all transaction
 * gas comes from the connected wallet (admin or student).
 *
 * Contract address + ABI are fetched from GET /api/contract/info?chainId=
 * on first use and cached in memory so each signing call is one round-trip.
 */
export function useContract() {
    const cacheRef = useRef({});

    /**
     * Fetch contract addresses + ABIs for the target chain. Cached in memory.
     */
    const getContractInfo = useCallback(async (chainId) => {
        const key = Number(chainId);
        if (cacheRef.current[key]) return cacheRef.current[key];

        const res = await api.get(`/api/contract/info?chainId=${key}`);
        const info = res.data;
        if (!info.certAddress) {
            throw new Error(
                `Contracts not deployed on this network (chain ${key}). Open the Deploy Contracts panel and deploy first.`
            );
        }
        cacheRef.current[key] = info;
        return info;
    }, []);

    const getSigner = async () => {
        if (!window.ethereum) throw new Error('MetaMask is not installed');
        const provider = new ethers.BrowserProvider(window.ethereum);
        return provider.getSigner();
    };

    // ── Issue ──────────────────────────────────────────────────────────────

    const issue = async (chainId, id, studentName, course, orgName, ipfsHash, fileHash) => {
        const { certAddress, certAbi } = await getContractInfo(chainId);
        const signer = await getSigner();
        const contract = new ethers.Contract(certAddress, certAbi, signer);
        const tx = await contract.issueCertificate(
            id, studentName, course, orgName, ipfsHash, fileHash
        );
        await tx.wait();
        return tx.hash;
    };

    const batchIssue = async (chainId, ids, names, courses, orgs, ipfsHashes, fileHashes) => {
        const { certAddress, certAbi } = await getContractInfo(chainId);
        const signer = await getSigner();
        const contract = new ethers.Contract(certAddress, certAbi, signer);
        const tx = await contract.batchIssueCertificates(
            ids, names, courses, orgs, ipfsHashes, fileHashes
        );
        await tx.wait();
        return tx.hash;
    };

    // ── Revoke ─────────────────────────────────────────────────────────────

    const verify = async (chainId, certId) => {
        const { certAddress, certAbi } = await getContractInfo(chainId);
        const provider = new ethers.BrowserProvider(window.ethereum);
        const contract = new ethers.Contract(certAddress, certAbi, provider);
        const result = await contract.verifyCertificate(certId);
        return {
            exists: result.exists,
            revoked: result.revoked
        };
    };

    const revoke = async (chainId, certId) => {
        const { certAddress, certAbi } = await getContractInfo(chainId);
        const signer = await getSigner();
        const contract = new ethers.Contract(certAddress, certAbi, signer);
        const tx = await contract.revokeCertificate(certId);
        await tx.wait();
        return tx.hash;
    };

    // ── SBT claim ──────────────────────────────────────────────────────────

    const issueSBT = async (chainId, studentAddress, certId, ipfsHash) => {
        const { sbtAddress, sbtAbi } = await getContractInfo(chainId);
        const signer = await getSigner();
        const contract = new ethers.Contract(sbtAddress, sbtAbi, signer);
        const uri = `ipfs://${ipfsHash}`;
        const tx = await contract.issueSBT(studentAddress, certId, uri);
        await tx.wait();
        return tx.hash;
    };

    return { getContractInfo, getSigner, issue, batchIssue, verify, revoke, issueSBT };
}
