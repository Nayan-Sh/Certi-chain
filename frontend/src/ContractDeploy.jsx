import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  Boxes, Copy, RefreshCw, ShieldCheck, ShieldAlert, ExternalLink,
  Wallet, CheckCircle2, XCircle, AlertTriangle, Zap
} from 'lucide-react';
import api from './api';
import NETWORKS from './networks';
import { useWallet } from './hooks/useWallet';

const DEFAULT_CHAIN_ID = 11155111; // Sepolia

const truncateAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '—';

const copyToClipboard = async (text, showToast) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!', 'success');
      return;
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showToast('Copied to clipboard!', 'success');
  } catch (err) {
    showToast('Copy failed — please copy manually', 'error');
  }
};

// ── Admin: Deploy Smart Contracts from MetaMask ────────────────────────────
// The admin connects their wallet, and the dApp deploys the Certificate +
// SoulboundCertificate contracts directly (the wallet signs the deployment
// transaction). The deployed address is read from each tx receipt and
// registered with the backend, which then uses it as its chain source of truth.
export default function ContractDeploy({ showToast, userRole }) {
  const { account, chainId, isConnecting, connect, ensureNetwork, isConnected, isInitialized } = useWallet();

  // Target network for deploy/status. Defaults to the wallet's current chain,
  // falling back to Sepolia when no wallet is connected yet.
  const [selectedChainId, setSelectedChainId] = useState(Number(chainId) || DEFAULT_CHAIN_ID);
  useEffect(() => {
    if (chainId) setSelectedChainId(Number(chainId));
  }, [chainId]);

  const [status, setStatus] = useState(null);        // registered ContractConfig
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [liveStatus, setLiveStatus] = useState(null); // 'live' | 'stale' | 'unknown'
  const [switching, setSwitching] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const isAdmin = userRole === 'admin';
  const activeChainId = Number(chainId) || selectedChainId;
  const activeNetwork = NETWORKS[activeChainId];

  const loadStatus = useCallback(async (targetChainId) => {
    const cid = Number(targetChainId) || selectedChainId || DEFAULT_CHAIN_ID;
    setLoadingStatus(true);
    try {
      const { data } = await api.get(`/api/contract/status?chainId=${cid}`);
      const config = data?.config;
      setStatus(config);
      setResult(null);
      setLiveStatus(null);
      if (config) {
        // Verify the registered addresses still hold live code on the target
        // network via its RPC. Uses the chain RPC (not MetaMask) so the check
        // is accurate even if the wallet is currently on a different network.
        const net = NETWORKS[cid];
        try {
          const provider = net?.rpcUrl ? new ethers.JsonRpcProvider(net.rpcUrl) : new ethers.BrowserProvider(window.ethereum);
          const [c, s] = await Promise.all([
            provider.getCode(config.certAddress),
            provider.getCode(config.sbtAddress),
          ]);
          setLiveStatus(c !== '0x' && s !== '0x' ? 'live' : 'stale');
        } catch {
          setLiveStatus('unknown');
        }
      } else {
        setLiveStatus('unknown');
      }
    } catch (err) {
      setError('Failed to load deployment status: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingStatus(false);
    }
  }, [selectedChainId]);

  useEffect(() => { loadStatus(selectedChainId); }, [loadStatus, selectedChainId]);

  const handleDeploy = async () => {
    setError('');
    setResult(null);
    if (!isAdmin) { setError('Only admins can deploy contracts.'); return; }

    // Wait for wallet initialization
    if (!isInitialized) {
      setError('Wallet not initialized. Please wait and try again.');
      return;
    }

    // 1. Wallet must be connected.
    let connected = isConnected;
    if (!connected) {
      try {
        await connect();
        connected = true;
      } catch (err) {
        setError('Could not connect wallet: ' + err.message);
        return;
      }
    }

    // 2. Point MetaMask at the chosen target network (switch or auto-add).
    try {
      setSwitching(true);
      await ensureNetwork(selectedChainId);
    } catch (err) {
      setError('Could not switch wallet to the target network: ' + err.message);
      return;
    } finally {
      setSwitching(false);
    }

    setDeploying(true);
    try {
      // 3. Fetch the compiled artifacts (ABI + bytecode) the browser needs.
      setStep('Fetching contract artifacts…');
      const [certArt, sbtArt] = await Promise.all([
        api.get('/api/contract/artifact/Certificate'),
        api.get('/api/contract/artifact/SoulboundCertificate'),
      ]);
      if (!certArt.data?.bytecode || !sbtArt.data?.bytecode) {
        throw new Error('Artifact bytecode missing — run `npx hardhat compile` in blockchain/ first.');
      }

      // 4. Deploy from the connected wallet (now on the target network).
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      setStep('Deploying Certificate contract…');
      const certTx = await signer.sendTransaction({
        data: certArt.data.bytecode,
      });
      const certReceipt = await certTx.wait();
      const certAddress = certReceipt.contractAddress;
      if (!certAddress) throw new Error('Certificate deploy returned no address.');

      setStep('Deploying SoulboundCertificate (SBT) contract…');
      const sbtTx = await signer.sendTransaction({
        data: sbtArt.data.bytecode,
      });
      const sbtReceipt = await sbtTx.wait();
      const sbtAddress = sbtReceipt.contractAddress;
      if (!sbtAddress) throw new Error('SBT deploy returned no address.');

      // 5. Register both addresses with the backend (admin JWT attached by api.js).
      setStep('Registering addresses with backend…');
      const { data } = await api.post('/api/contract/register', {
        certAddress,
        sbtAddress,
        certTxHash: certReceipt.hash,
        sbtTxHash: sbtReceipt.hash,
        chainId: selectedChainId,
      });

      setResult({
        certAddress,
        sbtAddress,
        certTxHash: certReceipt.hash,
        sbtTxHash: sbtReceipt.hash,
        config: data.config,
      });
      showToast('Contracts deployed & registered successfully!', 'success');
      await loadStatus();
    } catch (err) {
      setError(
        'Deployment failed: ' + (err.response?.data?.error || err.message || 'unknown error')
      );
      showToast('Deployment failed', 'error');
    } finally {
      setDeploying(false);
      setStep('');
    }
  };

  return (
    <div className="view-wrapper">
      <h1 className="title-glow text-gradient" style={{ margin: 0 }}>
        <Boxes size={28} color="var(--accent-purple)" />
        <span>Deploy Smart Contracts</span>
      </h1>
      <p style={{ color: 'var(--text-muted)', margin: '8px 0 24px', fontSize: '14px', lineHeight: 1.6 }}>
        Deploy the Certificate & Soulbound contracts <strong>directly from your MetaMask wallet</strong>.
        The contract address is captured from your signed deployment receipt — no manual `.env` editing.
      </p>

      {/* Wallet connection card */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: isConnected ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
            border: `1px solid ${isConnected ? 'var(--accent-green)' : '#f59e0b'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Wallet size={20} color={isConnected ? 'var(--accent-green)' : '#f59e0b'} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>
              {isConnected ? 'Wallet connected' : 'Connect wallet to deploy'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {isConnected ? account : 'Requires MetaMask'}
            </div>
          </div>
        </div>
        {!isConnected && (
          <button className="btn-3d" onClick={connect} disabled={isConnecting} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wallet size={16} /> {isConnecting ? 'Connecting…' : 'Connect Wallet'}
          </button>
        )}
      </div>

      {/* Target network selector */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="var(--accent-cyan)" /> Target Network
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <select
            value={selectedChainId}
            onChange={(e) => setSelectedChainId(Number(e.target.value))}
            style={{
              flex: 1, minWidth: '200px', padding: '12px 14px', borderRadius: '10px',
              background: 'rgba(0,0,0,0.25)', color: 'var(--text-main)', border: '1px solid var(--glass-border)',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {Object.values(NETWORKS).map((net) => (
              <option key={net.chainId} value={net.chainId} style={{ color: '#111' }}>
                {net.name} (chainId {net.chainId})
              </option>
            ))}
          </select>
          <button
            className="btn-3d"
            onClick={async () => {
              if (!isConnected) {
                try { await connect(); } catch (err) { setError('Could not connect wallet: ' + err.message); return; }
              }
              try {
                setSwitching(true);
                await ensureNetwork(selectedChainId);
                showToast('Wallet switched to ' + (NETWORKS[selectedChainId]?.name || selectedChainId), 'success');
              } catch (err) {
                setError('Could not switch wallet: ' + err.message);
              } finally {
                setSwitching(false);
              }
            }}
            disabled={switching}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={16} className={switching ? 'spin' : ''} />
            {switching ? 'Switching…' : 'Switch wallet to this network'}
          </button>
        </div>
        {isConnected && Number(chainId) !== selectedChainId && (
          <p style={{ fontSize: '12px', color: '#f59e0b', marginTop: '10px' }}>
            Your MetaMask is currently on <strong>{NETWORKS[Number(chainId)]?.name || `chainId ${chainId}`}</strong>.
            Deploying targets <strong>{NETWORKS[selectedChainId]?.name}</strong> — use the button above (or MetaMask's network menu) to switch first.
          </p>
        )}
      </div>

      {/* Registered deployment status */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="var(--accent-cyan)" /> Current Deployment
        </h3>

        {loadingStatus ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>
            <RefreshCw className="spin" size={20} />
            <p style={{ marginTop: '8px', fontSize: '13px' }}>Checking registered deployment…</p>
          </div>
        ) : !status ? (
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} />
            <span style={{ fontSize: '14px' }}>
              No deployment registered for <strong>{activeNetwork?.name || `chainId ${activeChainId}`}</strong> yet.
              Connect your wallet, switch to the target network, and click <strong>Deploy Contracts</strong>.
            </span>
          </div>
        ) : (
          <>
            {liveStatus === 'stale' && (
              <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                <ShieldAlert size={18} />
                <span>The registered addresses no longer hold live code on the chain. Redeploy below.</span>
              </div>
            )}
            {liveStatus === 'live' && (
              <div style={{ padding: '10px 14px', borderRadius: '12px', background: 'rgba(16,185,129,0.08)', border: '1px solid var(--accent-green)', color: 'var(--accent-green)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                <CheckCircle2 size={18} />
                <span>Contracts verified live on-chain.</span>
              </div>
            )}
            {[
              { label: 'Certificate Contract', addr: status.certAddress, tx: status.certTxHash },
              { label: 'Soulbound (SBT) Contract', addr: status.sbtAddress, tx: status.sbtTxHash },
            ].map((row) => (
              <div key={row.label} style={{
                padding: '12px 14px', borderRadius: '10px',
                background: 'rgba(0,0,0,0.15)', border: '1px solid var(--glass-border)',
                marginBottom: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{row.label}</span>
                  <button
                    onClick={() => copyToClipboard(row.addr, showToast)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
                <code style={{ fontSize: '12px', color: 'var(--accent-purple)', wordBreak: 'break-all', fontFamily: 'monospace' }}>{row.addr}</code>
                {row.tx && (
                  <div style={{ marginTop: '6px' }}>
                    <a
                      href={`${activeNetwork?.blockExplorerUrls?.[0] || 'https://sepolia.etherscan.io'}/tx/${row.tx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '11px',
                        color: 'var(--accent-cyan)',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <ExternalLink size={11} /> View deployment tx
                    </a>
                  </div>
                )}
              </div>
            ))}
            {status.deployedBy && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
                Deployed by <strong>{status.deployedBy}</strong> · {new Date(status.deployedAt).toLocaleString()} · chainId {status.chainId ?? '—'}
              </div>
            )}
          </>
        )}
      </div>

      {/* Deploy action */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        {error && (
          <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid var(--accent-red)', color: '#fca5a5', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
            <XCircle size={18} /> <span>{error}</span>
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleDeploy}
          disabled={deploying || loadingStatus}
          style={{
            width: '100%', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: 700,
            background: 'linear-gradient(135deg, var(--accent-purple), #d946ef)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            opacity: (deploying || loadingStatus) ? 0.6 : 1,
          }}
        >
          {deploying ? (
            <>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
              {step || 'Deploying…'}
            </>
          ) : (
            <>
              <Zap size={20} />
              Deploy Contracts from MetaMask
            </>
          )}
        </button>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '14px', lineHeight: 1.6 }}>
          Your wallet signs two deployment transactions (Certificate + SoulboundCertificate).
          Make sure the connected account holds {NETWORKS[selectedChainId]?.nativeCurrency?.symbol || 'ETH'} on{' '}
          <strong>{activeNetwork?.name || 'the target network'}</strong>. For testnets, grab free tokens from the network's faucet.
        </p>
      </div>

      {/* Deploy success result */}
      {result && (
        <div className="glass-panel" style={{ padding: '24px', marginTop: '24px', border: '2px solid var(--accent-green)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <CheckCircle2 size={24} color="var(--accent-green)" />
            <h3 style={{ margin: 0, color: 'var(--accent-green)', fontSize: '16px' }}>Deployment Registered</h3>
          </div>
          {[
            { label: 'Certificate', addr: result.certAddress },
            { label: 'Soulbound', addr: result.sbtAddress },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{row.label}</span>
              <code style={{ fontSize: '12px', color: 'var(--accent-cyan)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{row.addr}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}