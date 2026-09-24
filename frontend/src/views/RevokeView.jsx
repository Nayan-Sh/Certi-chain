import React, { useState } from 'react';
import api from '../api';
import { Trash2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

function RevokeView({ showToast, wallet, contract }) {
  const [certId, setCertId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);


  const handleRevoke = async () => {
    if (!certId) {
      showToast('Enter a Certificate ID!', 'warning');
      return;
    }
    if (!wallet.isConnected) {
      showToast('Connect your admin MetaMask wallet first (Revoke view)', 'warning');
      return;
    }
    const confirmed = window.confirm(`DANGER! Are you sure you want to PERMANENTLY REVOKE certificate:\n\n${certId}`);
    if (!confirmed) return;
    setBusy(true); setResult(null);
    try {
      // Preflight: the Certificate contract must be deployed on the connected
      // chain — sign nowhere else.
      try {
        await contract.getContractInfo(wallet.chainId);
        const onChainCert = await contract.verify(wallet.chainId, certId.trim());
        if (!onChainCert.exists) {
            setResult({ success: false, error: `Certificate ID "${certId.trim()}" does not exist on the connected network (Chain ${wallet.chainId}). Please check the ID or switch networks.` });
            showToast('Certificate not found on this network.', 'error');
            setBusy(false);
            return;
        }
        if (onChainCert.revoked) {
            setResult({ success: false, error: 'Certificate is already revoked on this network.' });
            showToast('Certificate already revoked.', 'warning');
            setBusy(false);
            return;
        }
      } catch (e) {
        setResult({ success: false, error: e.message });
        showToast(e.message, 'error');
        setBusy(false);
        return;
      }

      // Sign the on-chain revoke in MetaMask (admin pays gas). The upgraded
      // Certificate contract's revokeCertificate() is onlyOwner.
      const txHash = await contract.revoke(wallet.chainId, certId.trim());

      // Backend verifies the receipt, then flags the DB record as revoked.
      const res = await api.post(`/api/record-revoke`, {
        txHash,
        chainId: wallet.chainId,
        id: certId.trim(),
        adminAddress: wallet.account,
      });
      setResult({ success: true, id: res.data.id, txHash });
      setCertId('');
      showToast('Certificate revoked successfully', 'success');
    } catch (err) {
      setResult({ success: false, error: err.response?.data?.error || err.message });
      showToast('Revocation failed: ' + (err.response?.data?.error || err.message), 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="view-wrapper">
      <h1 className="title-glow text-gradient">
        <Trash2 size={28} color="var(--accent-red)" />
        Revocation Control
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '32px', lineHeight: 1.6 }}>
        Revoke a certificate to permanently flag it as invalid on the ledger. Anyone verifying this ID will immediately see a red revoked warning.
      </p>

      <div className="glass-panel" style={{ padding: '32px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.02)' }}>
        <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
          <AlertCircle size={18} /> This action is irreversible.
        </p>
        <input className="input-3d" placeholder="Enter Certificate ID to revoke" style={{ borderColor: 'rgba(239,68,68,0.3)', marginBottom: '20px' }} value={certId} onChange={e => setCertId(e.target.value)} />
        <button className="btn-danger btn-3d" onClick={handleRevoke} disabled={busy}>
          {busy ? 'Signing Revocation in MetaMask…' : 'Execute Blockchain Revocation'}
        </button>
        {!wallet.isConnected && (
          <p style={{ fontSize: '12px', color: '#f59e0b', margin: '12px 0 0', textAlign: 'center' }}>
            Connect your admin MetaMask wallet to sign the on-chain revocation (revokeCertificate is owner-only).
          </p>
        )}
      </div>

      {result && (
        <div style={{ marginTop: '24px', animation: 'slideUpFade 0.4s ease' }}>
          {result.success
            ? <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--accent-green)', display: 'flex', alignItems: 'center', gap: '12px', color: 'white' }}>
              <CheckCircle2 color="var(--accent-green)" /> <div>Certificate <code style={{ color: 'var(--accent-cyan)' }}>{result.id}</code> has been revoked permanently on-chain.
                {result.txHash && <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>Tx: <code style={{ color: 'var(--accent-purple)' }}>{result.txHash.slice(0, 30)}…</code></div>}
              </div>
            </div>
            : <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--accent-red)', display: 'flex', alignItems: 'center', gap: '12px', color: 'white' }}>
              <XCircle color="var(--accent-red)" /> <div>Revocation failed: {result.error}</div>
            </div>
          }
        </div>
      )}
    </div>
  );
}

export default RevokeView;
