import React, { useState, useEffect, useRef } from 'react';
import api, { historyApi } from '../api';
import { computeFileHash, truncateAddress, printHtml } from '../utils/helpers';
import { buildCertificateHtml } from '../utils/printTemplates';
import { NETWORKS } from '../utils/constants';
import {
  Shield, Search, Upload, Scan, CheckCircle, AlertCircle, Eye,
  Sparkles, FileText, ArrowRight, Printer, AlertTriangle,
  FileSearch, History, FileUp, X, RefreshCw, Fingerprint, XCircle,
  CheckCircle2, ShieldAlert, ShieldCheck, Wallet, Globe, Medal, Copy,
  Share2, ExternalLink, QrCode, User, BookOpen, Building2, Calendar
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useLocation } from 'react-router-dom';

import { fmtDateTime, copyToClipboard } from '../utils/helpers';
import StatusBadge from '../components/ui/StatusBadge';

function VerifyView({ showToast, wallet, contract }) {
  const [certId, setCertId] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [verificationHistory, setVerificationHistory] = useState(() => {
    const saved = localStorage.getItem('verificationHistory');
    return saved ? JSON.parse(saved) : [];
  });

  // Wallet & Web3 State — shared useWallet (account/chainId managed at App level)
  const walletAddress = wallet.account;
  const [isMintingSBT, setIsMintingSBT] = useState(false);
  const [sbtSuccessHash, setSbtSuccessHash] = useState('');
  const isMobile = window.innerWidth <= 768;

  const connectWallet = async () => {
    try {
      await wallet.connect();
      showToast('Wallet connected!', 'success');
    } catch (err) {
      showToast('Failed to connect wallet: ' + err.message, 'error');
    }
  };

  const claimAsNFT = async () => {
    if (!walletAddress) {
      showToast('Connect wallet first!', 'error');
      return;
    }
    if (!result || !result.ipfsHash) {
      showToast('Certificate data missing.', 'error');
      return;
    }

    // Get the certificate ID - it could be in different places depending on the response
    const certificateId = result.id || certId || result.certId;

    if (!certificateId) {
      showToast('Certificate ID not found.', 'error');
      return;
    }

    // The SBT must be minted on the same network the certificate was issued on.
    const targetChainId = Number(result.chainId) || Number(wallet.chainId) || 11155111;

    setIsMintingSBT(true);
    setSbtSuccessHash('');

    try {
      // Switch the student's wallet to the certificate's network if needed.
      await wallet.ensureNetwork(targetChainId);

      // Load the deployment only after MetaMask is on the target network.
      await contract.getContractInfo(targetChainId);
      const signer = await contract.getSigner();
      const signerAddress = await signer.getAddress();
      if (signerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error('MetaMask account changed. Reconnect the wallet and try again.');
      }

      // Sign the SBT claim in MetaMask (student pays gas).
      const txHash = await contract.issueSBT(targetChainId, walletAddress, certificateId, result.ipfsHash);

      // Backend verifies the receipt against the SBT contract, then mirrors it in DB.
      const res = await api.post(`/api/record-claim-sbt`, {
        txHash,
        chainId: targetChainId,
        certId: certificateId,
        studentAddress: walletAddress,
      });

      if (res.data.success) {
        setSbtSuccessHash(txHash);
        showToast('Soulbound NFT minted successfully!', 'success');
      }
    } catch (err) {
      showToast('NFT Claim Failed: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setIsMintingSBT(false);
    }
  };

  const handleVerify = async () => {
    if (!certId) {
      showToast('Enter a Certificate ID!', 'warning');
      return;
    }
    setBusy(true); setResult(null); setSbtSuccessHash('');
    try {
      let fileHash = null;
      if (file) fileHash = await computeFileHash(file);

      const cleanId = certId.trim();
      const res = await api.get(`/api/verify/${cleanId}`, { params: fileHash ? { fileHash } : {} });
      const newResult = {
        status: res.data.hashMatch === true ? 'VERIFIED' : res.data.hashMatch === false ? 'TAMPERED' : 'FOUND_NO_FILE',
        ...res.data,
        computedHash: fileHash,
        verifiedAt: new Date().toISOString(),
      };
      setResult(newResult);

      // Save to history via API (only if logged in as student or admin, though history is mostly for students)
      try {
        await historyApi.addHistory({
          certificateId: cleanId,
          status: newResult.status === 'VERIFIED' ? 'verified' : newResult.status === 'TAMPERED' ? 'invalid' : 'error',
          metadata: { originalStatus: newResult.status }
        });
      } catch (err) {
        console.warn('Could not save history to DB:', err);
      }

      const newHistory = [{ id: cleanId, timestamp: Date.now(), status: newResult.status }, ...verificationHistory].slice(0, 10);
      setVerificationHistory(newHistory);
      localStorage.setItem('verificationHistory', JSON.stringify(newHistory));

      if (newResult.status === 'VERIFIED') {
        showToast('Certificate verified successfully!', 'success');
      } else if (newResult.status === 'TAMPERED') {
        showToast('Certificate has been tampered with!', 'error');
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setResult({ status: 'NOT_FOUND', error: 'Certificate ID not found on blockchain.' });
        showToast('Certificate not found', 'error');
        // Save not found to history
        try {
          await historyApi.addHistory({ certificateId: certId.trim(), status: 'invalid', metadata: { error: 'NOT_FOUND' } });
        } catch (e) { }
      } else {
        showToast('Error: ' + (err.response?.data?.error || err.message), 'error');
      }
    } finally { setBusy(false); }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Certificate Verification',
          text: `Verify certificate ${certId} on CertifyChain`,
          url: verifyUrl
        });
      } catch {
        copyToClipboard(verifyUrl, showToast);
      }
    } else {
      copyToClipboard(verifyUrl, showToast);
    }
  };

  // Use current hostname for QR code to ensure mobile devices can access it
  const verifyUrl = `${window.location.protocol}//${window.location.host}/?verify=${certId}`;

  return (
    <div className="view-wrapper">
      <h1 className="title-glow text-gradient">
        <FileSearch size={28} color="var(--accent-purple)" />
        Cryptographic Verification
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
        Enter an ID to look up blockchain metadata. Optional: Drop the PDF to verify its exact cryptographic hash matches the immutable ledger.
      </p>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <input
          className="input-3d"
          placeholder="Certificate ID (e.g., CERT-XXX)"
          value={certId}
          onChange={e => setCertId(e.target.value)}
          style={{ flex: 1, marginBottom: 0 }}
        />
      </div>

      {/* Recent Verifications */}
      {verificationHistory.length > 0 && !result && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Recent Verifications
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {verificationHistory.map((item, idx) => (
              <button
                key={idx}
                onClick={() => setCertId(item.id)}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <History size={12} />
                {item.id.slice(0, 15)}...
              </button>
            ))}
          </div>
        </div>
      )}

      <label className={`upload-zone ${file ? 'active' : ''}`} style={{ display: 'block' }}>
        <FileUp size={32} color={file ? 'var(--accent-purple)' : 'var(--text-muted)'} style={{ marginBottom: 10, transition: 'all 0.3s' }} />
        <h4 style={{ margin: '0 0 6px', color: file ? 'white' : 'var(--text-muted)', fontSize: '15px' }}>
          {file ? 'PDF Ready for Hash Check' : 'Drop PDF Certificate to verify exact contents (Optional)'}
        </h4>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '11px', opacity: 0.7 }}>
          PDF only. Max 10MB.
        </p>
        <input
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={e => {
            const selectedFile = e.target.files[0];
            if (selectedFile) {
              const allowedTypes = ['application/pdf', 'application/x-pdf'];
              const maxSize = 10 * 1024 * 1024; // 10MB

              if (!allowedTypes.includes(selectedFile.type)) {
                showToast('Invalid file type. Only PDF certificate documents are accepted.', 'error');
                e.target.value = '';
                return;
              }

              if (selectedFile.size > maxSize) {
                showToast('File too large. Maximum size is 10MB.', 'error');
                e.target.value = '';
                return;
              }

              setFile(selectedFile);
            }
          }}
        />
        {file && (
          <div style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '99px', color: 'var(--accent-purple)', fontSize: '12px', fontWeight: 600 }}>
            📄 {file.name}
            <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}
      </label>

      <button className="btn-3d" style={{ background: 'linear-gradient(135deg, var(--accent-purple), #d946ef)' }} onClick={handleVerify} disabled={busy}>
        {busy ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> <span>Querying Ledger...</span></div> : <><Fingerprint size={18} style={{ marginRight: '8px' }} /> Verify Authenticity</>}
      </button>

      {result && (
        <div style={{ marginTop: '32px', animation: 'slideUpFade 0.5s ease' }}>
          <StatusBadge status={result.status} />

          {(result.status === 'VERIFIED' || result.status === 'FOUND_NO_FILE') && (
            <>
              {/* Professional Certificate Card - As shown in Research Paper Figure 5 */}
              <div className="glass-panel" style={{
                padding: isMobile ? '20px' : '32px',
                marginBottom: '24px',
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
                border: result.revoked ? '2px solid var(--accent-red)' : '2px solid var(--accent-green)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                {/* Certificate Header */}
                <div style={{
                  textAlign: 'center',
                  marginBottom: '24px',
                  paddingBottom: '20px',
                  borderBottom: '1px solid rgba(255,255,255,0.1)'
                }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '12px'
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: result.revoked
                        ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                        : 'linear-gradient(135deg, #10b981, #059669)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: result.revoked
                        ? '0 0 20px rgba(239, 68, 68, 0.5)'
                        : '0 0 20px rgba(16, 185, 129, 0.5)'
                    }}>
                      {result.revoked ? <XCircle size={24} color="white" /> : <CheckCircle2 size={24} color="white" />}
                    </div>
                    <div>
                      <h2 style={{
                        margin: 0,
                        fontSize: isMobile ? '20px' : '24px',
                        color: result.revoked ? 'var(--accent-red)' : 'var(--accent-green)',
                        fontWeight: 700
                      }}>
                        {result.revoked ? 'CERTIFICATE REVOKED' : 'CERTIFICATE VERIFIED'}
                      </h2>
                      <p style={{
                        margin: '4px 0 0 0',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em'
                      }}>
                        Blockchain Secured Document
                      </p>
                    </div>
                  </div>
                </div>

                {/* Certificate Details Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: isMobile ? '16px' : '24px',
                  marginBottom: '24px'
                }}>
                  {/* Recipient */}
                  <div style={{
                    padding: '16px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      <User size={14} /> Recipient
                    </div>
                    <div style={{
                      fontSize: isMobile ? '16px' : '18px',
                      fontWeight: 600,
                      color: 'var(--text-main)'
                    }}>
                      {result.studentName}
                    </div>
                  </div>

                  {/* Credential */}
                  <div style={{
                    padding: '16px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      <BookOpen size={14} /> Credential
                    </div>
                    <div style={{
                      fontSize: isMobile ? '16px' : '18px',
                      fontWeight: 600,
                      color: 'var(--text-main)'
                    }}>
                      {result.course}
                    </div>
                  </div>

                  {/* Issuer */}
                  <div style={{
                    padding: '16px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      <Building2 size={14} /> Issuer
                    </div>
                    <div style={{
                      fontSize: isMobile ? '16px' : '18px',
                      fontWeight: 600,
                      color: 'var(--text-main)'
                    }}>
                      {result.orgName}
                    </div>
                  </div>

                  {/* Issue Date */}
                  {result.issuedAt && (
                    <div style={{
                      padding: '16px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        <Calendar size={14} /> Issue Date
                      </div>
                      <div style={{
                        fontSize: isMobile ? '16px' : '18px',
                        fontWeight: 600,
                        color: 'var(--accent-cyan)'
                      }}>
                        {new Date(result.issuedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Certificate ID & Status */}
                <div style={{
                  padding: '16px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '12px',
                  marginBottom: '20px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '4px'
                      }}>
                        Certificate ID
                      </div>
                      <code style={{
                        fontSize: '14px',
                        color: 'var(--accent-purple)',
                        fontFamily: 'monospace'
                      }}>
                        {result.id || certId}
                      </code>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      background: result.revoked
                        ? 'rgba(239, 68, 68, 0.2)'
                        : 'rgba(16, 185, 129, 0.2)',
                      borderRadius: '20px',
                      border: `1px solid ${result.revoked ? 'var(--accent-red)' : 'var(--accent-green)'}`,
                      color: result.revoked ? 'var(--accent-red)' : 'var(--accent-green)',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>
                      {result.revoked ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                      {result.revoked ? 'REVOKED' : 'ACTIVE'}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}>
                  <button
                    onClick={() => printHtml('CertifyChain Certificate', buildCertificateHtml(result))}
                    className="btn-3d"
                    style={{
                      flex: 1,
                      minWidth: '140px',
                      padding: '12px 20px',
                      fontSize: '13px',
                      background: 'transparent',
                      border: '1px solid var(--accent-cyan)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Printer size={16} /> Print Certificate
                  </button>
                  <button
                    onClick={() => copyToClipboard(`${window.location.origin}/?verify=${result.id || certId}`, showToast)}
                    className="btn-3d"
                    style={{
                      flex: 1,
                      minWidth: '140px',
                      padding: '12px 20px',
                      fontSize: '13px',
                      background: 'transparent',
                      border: '1px solid var(--accent-purple)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Share2 size={16} /> Share Link
                  </button>
                  {result.ipfsHash && result.ipfsHash.startsWith('Qm') && result.ipfsHash.length === 46 && (
                    <a
                      href={`https://gateway.pinata.cloud/ipfs/${result.ipfsHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-3d"
                      style={{
                        flex: 1,
                        minWidth: '140px',
                        padding: '12px 20px',
                        fontSize: '13px',
                        background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        textDecoration: 'none',
                        color: '#020617'
                      }}
                    >
                      <ExternalLink size={16} /> View on IPFS
                    </a>
                  )}
                </div>

                {result.revoked && (
                  <div style={{
                    marginTop: '20px',
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'rgba(239,68,68,0.15)',
                    border: '2px solid var(--accent-red)',
                    color: 'var(--accent-red)',
                    fontSize: '14px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: 'inset 0 0 20px rgba(239,68,68,0.2)'
                  }}>
                    <ShieldAlert size={24} />
                    <div>
                      <div style={{ fontWeight: 800, marginBottom: '4px' }}>CERTIFICATE REVOKED BY ISSUER</div>
                      <div style={{ fontSize: '12px', fontWeight: 400, opacity: 0.9 }}>
                        This certificate has been permanently revoked and is no longer valid.
                      </div>
                    </div>
                  </div>
                )}

                {/* Digital Wallet Integration */}
                {!result.revoked && result.status === 'VERIFIED' && (
                  <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid rgba(168,85,247,0.3)' }}>
                    <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Wallet size={18} /> Web3 Digital Wallet Integration
                    </h4>

                    {!walletAddress ? (
                      <button onClick={connectWallet} className="btn-3d" style={{ width: '100%', background: 'transparent', border: '1px solid var(--accent-purple)', color: 'white', padding: '14px 24px', fontSize: '14px' }}>
                        <Globe size={16} style={{ marginRight: '8px' }} /> Connect MetaMask to Claim NFT
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-green)' }} />
                          Connected: <code style={{ color: 'var(--accent-cyan)' }}>{truncateAddress(walletAddress)}</code>
                        </div>

                        {sbtSuccessHash ? (
                          <div style={{ padding: '16px', background: 'rgba(16,185,129,0.15)', border: '2px solid var(--accent-green)', borderRadius: '12px', color: 'white', fontSize: '14px' }}>
                            <CheckCircle2 color="var(--accent-green)" size={20} style={{ marginBottom: '8px', display: 'block' }} />
                            <strong>Soulbound NFT Claimed Successfully!</strong><br />
                            <span style={{ fontSize: '12px', opacity: 0.8 }}>Tx: {sbtSuccessHash.slice(0, 20)}...</span>
                          </div>
                        ) : (
                          <button onClick={claimAsNFT} disabled={isMintingSBT} className="btn-3d" style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))', padding: '14px 24px', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            {isMintingSBT ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Medal size={18} />}
                            {isMintingSBT ? 'Minting Soulbound NFT...' : 'Claim as Soulbound NFT'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {result.status === 'FOUND_NO_FILE' && (
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
                    <AlertCircle size={20} />
                    <div>
                      <strong>Metadata Verified</strong><br />
                      <span style={{ fontSize: '12px', opacity: 0.8 }}>Blockchain record confirmed, but file integrity was not checked. Upload the certificate file for complete verification.</span>
                    </div>
                  </div>
                )}

                {result.txHash && (
                  <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Blockchain Transaction Hash</span>
                      <button onClick={() => copyToClipboard(result.txHash, showToast)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <Copy size={16} />
                      </button>
                    </div>
                    <code style={{ color: 'var(--accent-purple)', fontSize: '13px', wordBreak: 'break-all', fontFamily: 'monospace' }}>{result.txHash}</code>
                    <a
                      href={`${NETWORKS[result.chainId || 11155111]?.blockExplorerUrls?.[0] || 'https://sepolia.etherscan.io'}/tx/${result.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginTop: '12px',
                        fontSize: '12px',
                        color: 'var(--accent-cyan)',
                        textDecoration: 'none'
                      }}
                    >
                      <ExternalLink size={12} /> View on {(NETWORKS[result.chainId || 11155111]?.name || 'Sepolia')} Explorer
                    </a>
                  </div>
                )}
              </div>

              {/* Share Button for Mobile */}
              {isMobile && (
                <button onClick={handleShare} className="btn-3d" style={{ width: '100%', marginBottom: '20px', background: 'var(--glass-bg)', border: '1px solid var(--accent-cyan)' }}>
                  <Share2 size={18} style={{ marginRight: '8px' }} /> Share Verification
                </button>
              )}

              {/* 3D Floating QR Code */}
              <div className="glass-panel" style={{ padding: '30px', textAlign: 'center', transformStyle: 'preserve-3d', animation: 'float 6s ease-in-out infinite' }}>
                <p style={{ margin: '0 0 20px', color: 'white', fontSize: '14px', fontWeight: 600 }}>
                  <QrCode size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                  Scan to Open Digital Portfolio View
                </p>
                <div style={{ display: 'inline-block', padding: '16px', background: 'white', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
                  <QRCodeSVG value={verifyUrl} size={isMobile ? 140 : 160} />
                </div>
                <p style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {verifyUrl}
                </p>
              </div>

              {result.aiScore !== null && result.aiScore !== undefined && (
                <AiReportCard trust_score={result.aiScore} details={result.aiDetails} ai_safe={result.aiScore >= 40} compact={isMobile} />
              )}

              {/* Printable Certificate Section - Hidden on screen, visible when printing */}
              <div className="printable-receipt" style={{ display: 'none' }}>
                <div style={{
                  padding: '40px',
                  background: 'white',
                  color: 'black',
                  fontFamily: 'Arial, sans-serif',
                  maxWidth: '600px',
                  margin: '0 auto'
                }}>
                  <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '2px solid #333', paddingBottom: '20px' }}>
                    <AppLogo size={52} />
                    <h1 style={{ margin: '0 0 6px 0', fontSize: '26px', color: '#0f172a' }}>CertifyChain</h1>
                    <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>Blockchain Certificate Verification System</p>
                  </div>

                  <h2 style={{ textAlign: 'center', marginBottom: '24px', color: result.revoked ? '#dc2626' : '#0d9488' }}>
                    {result.revoked ? 'CERTIFICATE REVOKED' : 'CERTIFICATE VERIFICATION'}
                  </h2>

                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '12px 0', fontWeight: 'bold', width: '40%' }}>Certificate ID:</td>
                        <td style={{ padding: '12px 0', fontFamily: 'monospace' }}>{result.id || certId}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '12px 0', fontWeight: 'bold' }}>Recipient Name:</td>
                        <td style={{ padding: '12px 0' }}>{result.studentName}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '12px 0', fontWeight: 'bold' }}>Course / Credential:</td>
                        <td style={{ padding: '12px 0' }}>{result.course}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '12px 0', fontWeight: 'bold' }}>Issuing Organization:</td>
                        <td style={{ padding: '12px 0' }}>{result.orgName}</td>
                      </tr>
                      {result.issuedAt && (
                        <>
                          <tr style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: '12px 0', fontWeight: 'bold' }}>Issue Date:</td>
                            <td style={{ padding: '12px 0' }}>{(fmtDateTime(result.issuedAt) || {}).date || '—'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: '12px 0', fontWeight: 'bold' }}>Issue Time:</td>
                            <td style={{ padding: '12px 0' }}>{(fmtDateTime(result.issuedAt) || {}).time || '—'}</td>
                          </tr>
                        </>
                      )}
                      {result.verifiedAt && (
                        <>
                          <tr style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: '12px 0', fontWeight: 'bold' }}>Verified Date:</td>
                            <td style={{ padding: '12px 0' }}>{(fmtDateTime(result.verifiedAt) || {}).date || '—'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: '12px 0', fontWeight: 'bold' }}>Verified Time:</td>
                            <td style={{ padding: '12px 0' }}>{(fmtDateTime(result.verifiedAt) || {}).time || '—'}</td>
                          </tr>
                        </>
                      )}
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '12px 0', fontWeight: 'bold' }}>Status:</td>
                        <td style={{ padding: '12px 0', color: result.revoked ? '#dc2626' : '#0d9488', fontWeight: 'bold' }}>
                          {result.revoked ? 'REVOKED' : 'ACTIVE'}
                        </td>
                      </tr>
                      {result.aiScore !== null && result.aiScore !== undefined && (
                        <tr style={{ borderBottom: '1px solid #ddd' }}>
                          <td style={{ padding: '12px 0', fontWeight: 'bold' }}>AI Trust Score:</td>
                          <td style={{ padding: '12px 0' }}>{result.aiScore}%</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {result.txHash && (
                    <div style={{ marginBottom: '20px' }}>
                      <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '12px', color: '#666' }}>BLOCKCHAIN TRANSACTION HASH:</p>
                      <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                        {result.txHash}
                      </p>
                    </div>
                  )}

                  {result.storedFileHash && (
                    <div style={{ marginBottom: '20px' }}>
                      <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '12px', color: '#666' }}>FILE HASH (SHA-256):</p>
                      <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                        {result.storedFileHash}
                      </p>
                    </div>
                  )}

                  <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #ddd', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#666' }}>Scan to verify this certificate</p>
                    <div style={{ display: 'inline-block', padding: '12px', background: 'white', border: '1px solid #ddd', borderRadius: '8px' }}>
                      <QRCodeSVG value={`${window.location.protocol}//${window.location.host}/?verify=${result.id || certId}`} size={128} />
                    </div>
                    <p style={{ margin: '10px 0 0 0', fontFamily: 'monospace', fontSize: '11px', color: '#333', wordBreak: 'break-all' }}>
                      {window.location.origin}/?verify={result.id || certId}
                    </p>
                  </div>

                  <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '11px', color: '#999' }}>
                    <p>Verified On: {result.verifiedAt ? new Date(result.verifiedAt).toLocaleString() : new Date().toLocaleString()}</p>
                    <p>Printed On: {new Date().toLocaleString()}</p>
                    <p>Blockchain-secured certificate verification system.</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {result.status === 'TAMPERED' && (
            <div className="glass-panel" style={{ padding: '24px', background: 'rgba(239,68,68,0.05)', border: '1px solid var(--accent-red)' }}>
              <p style={{ color: 'var(--accent-red)', fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>
                <ShieldAlert size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                The uploaded file does NOT match the cryptographic signature on the blockchain. The file has been altered.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>On-Chain Root Hash (Authentic):</span>
                  <code style={{ color: 'var(--accent-green)', wordBreak: 'break-all', fontSize: '12px', display: 'block', padding: '8px', background: 'rgba(0,0,0,0.5)', borderRadius: '8px', marginTop: '4px' }}>{result.storedFileHash}</code>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your File Hash (Altered):</span>
                  <code style={{ color: 'var(--accent-red)', wordBreak: 'break-all', fontSize: '12px', display: 'block', padding: '8px', background: 'rgba(0,0,0,0.5)', borderRadius: '8px', marginTop: '4px' }}>{result.computedHash}</code>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default VerifyView;
