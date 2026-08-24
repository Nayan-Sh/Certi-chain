import { useState, useCallback, useEffect, useRef } from 'react';
import NETWORKS from '../networks';

export function useWallet() {
    const [account, setAccount] = useState('');
    const [chainId, setChainId] = useState(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const listenersAttached = useRef(false);

    // ── Listen for account / chain changes ───────────────────────────────
    useEffect(() => {
        if (!window.ethereum) return;
        if (listenersAttached.current) return;
        listenersAttached.current = true;

        const handleAccountsChanged = (accounts) => {
            setAccount(accounts[0] || '');
        };

        const handleChainChanged = (hexChainId) => {
            setChainId(parseInt(hexChainId, 16));
        };

        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);

        // Sync with current state on mount (handles page refresh)
        window.ethereum.request({ method: 'eth_accounts' }).then((accounts) => {
            if (accounts.length > 0) setAccount(accounts[0]);
        }).catch(() => {});
        window.ethereum.request({ method: 'eth_chainId' }).then((hex) => {
            setChainId(parseInt(hex, 16));
        }).catch(() => {});

        setIsInitialized(true);

        return () => {
            window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            window.ethereum.removeListener('chainChanged', handleChainChanged);
            listenersAttached.current = false;
        };
    }, []);

    const connect = useCallback(async () => {
        if (!window.ethereum) {
            throw new Error('MetaMask not found — install it from https://metamask.io/');
        }
        setIsConnecting(true);
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const hex = await window.ethereum.request({ method: 'eth_chainId' });
            setAccount(accounts[0]);
            setChainId(parseInt(hex, 16));
        } finally {
            setIsConnecting(false);
        }
    }, []);

    const disconnect = useCallback(() => {
        setAccount('');
        setChainId(null);
    }, []);

    /**
     * Ensure MetaMask is on the target chain. Prompts the user to switch (or
     * adds the network to MetaMask automatically if it's not configured).
     */
    const ensureNetwork = useCallback(async (targetChainId) => {
        if (!window.ethereum) throw new Error('MetaMask not installed');
        const id = Number(targetChainId);
        const net = NETWORKS[id];
        if (!net) throw new Error(`Unknown network ${id} — add it to networks.js first.`);

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: net.chainIdHex }],
            });
        } catch (switchErr) {
            // 4902 = chain not installed in MetaMask — try adding it
            if (switchErr.code === 4902 && net.rpcUrl) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: net.chainIdHex,
                        chainName: net.name,
                        rpcUrls: [net.rpcUrl],
                        nativeCurrency: net.nativeCurrency,
                        blockExplorerUrls: net.blockExplorerUrls || [],
                    }],
                });
            } else {
                throw switchErr;
            }
        }
    }, []);

    return { account, chainId, isConnecting, isConnected: !!account, isInitialized, connect, disconnect, ensureNetwork };
}
