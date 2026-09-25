import React, { useState } from 'react';
import api from '../api';
import { NETWORKS } from '../utils/constants';

import {
  X, Copy, CheckCircle2, FileText, Zap, Printer,
  FileUp, Sparkles, AlertCircle, RefreshCw, Share2,
  QrCode, ExternalLink, Layers, Hash, Check
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import { genId } from '../utils/helpers';
import AiReportCard from '../components/ui/AiReportCard';
import StatusBadge from '../components/ui/StatusBadge';
import StatTile from '../components/ui/StatTile';

function IssueView({ showToast, wallet, contract }) {
  const [mode, setMode] = useState('single');
  const [form, setForm] = useState({ id: genId(), studentName: '', course: '', orgName: 'CertifyChain Institute', studentEmail: '' });
  const [file, setFile] = useState(null);


  const [batchFiles, setBatchFiles] = useState([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [batchToken, setBatchToken] = useState(null);
  const [reviewRows, setReviewRows] = useState([]);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const isMobile = window.innerWidth <= 768;

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    const allowedTypes = ['application/pdf', 'application/x-pdf'];
    const maxSize = 10 * 1024 * 1024;

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
  };

  const handleBatchFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newBatchFiles = files.map((file) => ({ id: genId(), file, studentName: '', course: '' }));
    setBatchFiles((prev) => [...prev, ...newBatchFiles]);
    setResult(null);
    setBatchToken(null);
    setReviewRows([]);
    e.target.value = '';
  };



  const updateReviewRow = (idx, field, value) => {
    setReviewRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const handleAnalyzeBatch = async () => {
    if (batchFiles.length === 0) {
      showToast('Please upload at least one PDF certificate', 'warning');
      return;
    }

    setAnalyzing(true);
    setBatchProcessing(true);
    setResult(null);
    setBatchToken(null);
    setReviewRows([]);

    const formData = new FormData();
    formData.append('orgName', form.orgName);
    batchFiles.forEach((f) => formData.append('files', f.file));

    setBatchProgress(10);

    try {
      const res = await api.post('/api/analyze-batch', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) {
            const uploadPct = Math.round((e.loaded / e.total) * 60);
            setBatchProgress(10 + uploadPct);
          }
        },
      });

      setBatchProgress(100);
      if (res.data.success) {
        setBatchToken(res.data.token);
        setReviewRows(res.data.results);
        showToast(`AI analysis complete — ${res.data.approvedCount} approved, ${res.data.rejectedCount} rejected`, res.data.rejectedCount > 0 ? 'warning' : 'success');
      }
    } catch (err) {
      setBatchProgress(0);
      showToast('Analysis failed: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setAnalyzing(false);
      setBatchProcessing(false);
    }
  };

  const handleMintReviewed = async () => {
    if (!batchToken || reviewRows.length === 0) {
      showToast('Analyze the certificates first', 'warning');
      return;
    }
    if (!wallet.isConnected) {
      showToast('Connect your admin MetaMask wallet first (Issue view)', 'warning');
      return;
    }

    try {
      await contract.getContractInfo(wallet.chainId);
    } catch (e) {
      showToast(e.message, 'error');
      return;
    }

    const certificates = reviewRows
      .filter((r) => r.passed)
      .map((r) => ({
        studentName: (r.studentName || '').trim(),
        course: (r.course || '').trim(),
        orgName: (r.orgName || form.orgName || '').trim(),
      }));

    if (certificates.length === 0) {
      showToast('No approved certificates to mint', 'warning');
      return;
    }

    setBusy(true);
    setBatchProcessing(true);
    setResult(null);

    try {
      const prep = await api.post('/api/prepare-batch-mint', { token: batchToken, certificates, orgName: form.orgName });
      const records = prep.data?.records;
      if (!prep.data?.success || !Array.isArray(records) || records.length === 0) {
        throw new Error(prep.data?.message || 'Preparation failed — no records returned.');
      }

      const txHash = await contract.batchIssue(
        wallet.chainId,
        records.map((r) => r.id),
        records.map((r) => r.studentName),
        records.map((r) => r.course),
        records.map((r) => r.orgName),
        records.map((r) => r.ipfsHash),
        records.map((r) => r.hash),
      );

      const res = await api.post('/api/record-mint', {
        txHash,
        chainId: wallet.chainId,
        adminAddress: wallet.account,
        records,
      });

      setBatchProgress(100);
      if (res.data.success) {
        setResult({
          status: 'BATCH_ISSUED',
          message: `Successfully issued ${res.data.mintedCount} of ${prep.data.totalFiles} certificates`,
          txHash,
          chainId: wallet.chainId,
          isBatch: true,
          mintedCount: res.data.mintedCount,
          rejectedCount: prep.data.rejectedCount,
          totalFiles: prep.data.totalFiles,
          batchResults: prep.data.results,
        });
        showToast(`${res.data.mintedCount} certificates minted! ${prep.data.rejectedCount > 0 ? prep.data.rejectedCount + ' rejected by AI' : ''}`, 'success');
        setBatchFiles([]);
        setReviewRows([]);
        setBatchToken(null);
      }
    } catch (err) {
      setBatchProgress(0);
      const errData = err.response?.data;
      if (errData?.error === 'BATCH_EXPIRED') {
        setBatchToken(null);
        setReviewRows([]);
        showToast('Batch session expired — please analyze the files again', 'error');
      } else {
        showToast('Mint failed: ' + (errData?.message || errData?.error || err.message), 'error');
      }
    } finally {
      setBusy(false);
      setBatchProcessing(false);
    }
  };

  const handleSingleIssue = async () => {
    if (!file) {
      showToast('Please upload a PDF certificate file!', 'warning');
      return;
    }
    if (!wallet.isConnected) {
      showToast('Connect your admin MetaMask wallet first (Issue view)', 'warning');
      return;
    }

    try {
      await contract.getContractInfo(wallet.chainId);
    } catch (e) {
      showToast(e.message, 'error');
      return;
    }

    setBusy(true);
    setResult(null);


    try {
      const payload = new FormData();
      payload.append('file', file);
      Object.entries(form).forEach(([k, v]) => payload.append(k, v));

      const prep = await api.post('/api/prepare-single', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },

      });

      if (!prep.data?.success || !prep.data.record) {
        throw new Error(prep.data?.message || 'Preparation failed');
      }

      const rec = prep.data.record;
      const txHash = await contract.issue(
        wallet.chainId,
        rec.id,
        rec.studentName,
        rec.course,
        rec.orgName,
        rec.ipfsHash,
        rec.hash,
      );

      const res = await api.post('/api/record-mint', {
        txHash,
        chainId: wallet.chainId,
        adminAddress: wallet.account,
        records: [rec],
      });

      if (res.data.success) {
        setResult({
          status: 'ISSUED',
          fileHash: rec.hash,
          txHash,
          chainId: wallet.chainId,
          ipfsHash: rec.ipfsHash,
          trust_score: rec.aiScore ?? 0,
          details: rec.aiDetails ?? {},
          ai_safe: true,
          ai_message: '',
          certId: rec.id,
          studentName: rec.studentName,
          course: rec.course,
          orgName: rec.orgName,
          issuedAt: new Date().toISOString(),
        });
        setForm((f) => ({ ...f, id: genId() }));
        setFile(null);
        showToast('Certificate issued successfully!', 'success');
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.error === 'AI_REJECTED' || errData?.error === 'AI_VALIDATION_FAILED' || errData?.error === 'FIELD_MISMATCH' || errData?.error === 'NOT_A_CERTIFICATE_DOCUMENT') {
        const aiData = errData.aiAnalysis || {};
        setResult({
          status: 'AI_REJECTED',
          message: errData.message || aiData.message,
          trust_score: aiData.trust_score ?? 0,
          details: aiData.details || errData.details || {},
          ai_safe: false,
          ai_message: aiData.message,
        });
        showToast(errData.message || 'Certificate rejected by AI analysis', 'error');
      } else {
        showToast('Error: ' + (errData?.message || errData?.error || err.message), 'error');
      }
    } finally {
      setBusy(false);

    }
  };

  return (
    <div className="view-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="title-glow text-gradient" style={{ margin: 0 }}>
          <FileUp size={28} color="var(--accent-blue)" />
          Deploy to Ledger &amp; AI Guard
        </h1>

        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.04)', borderRadius: '12px', padding: '4px', border: '1px solid var(--glass-border)' }}>
          <button onClick={() => { setMode('single'); setResult(null); }} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer', background: mode === 'single' ? 'var(--accent-blue)' : 'transparent', color: mode === 'single' ? '#fff' : 'var(--text-muted)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileUp size={14} /> Single
          </button>
          <button onClick={() => { setMode('batch'); setResult(null); }} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer', background: mode === 'batch' ? 'var(--accent-purple)' : 'transparent', color: mode === 'batch' ? '#fff' : 'var(--text-muted)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={14} /> Bulk Upload (PDFs)
          </button>
        </div>
      </div>

      {mode === 'single' ? (
        <div style={{ animation: 'slideUpFade 0.4s ease' }}>
          <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', borderLeft: '4px solid var(--accent-blue)' }}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text-main)', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileUp size={18} color="var(--accent-blue)" />
              Issue Single Certificate
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5, marginBottom: '16px' }}>
              Upload a PDF certificate and fill in the recipient details. The AI will validate the document integrity and extract key fields before minting on the blockchain.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <input className="input-3d" placeholder="Issuing Organization" value={form.orgName} onChange={(e) => upd('orgName', e.target.value)} />
              <input className="input-3d" placeholder="Student Email (optional — certificate emailed after minting)" type="email" value={form.studentEmail} onChange={(e) => upd('studentEmail', e.target.value)} />
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 20px', color: 'var(--text-main)', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Hash size={16} color="var(--accent-cyan)" />
              Certificate Details
            </h4>

            <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'rgba(0, 242, 254, 0.04)', border: '1px dashed rgba(0, 242, 254, 0.3)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Certificate ID
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Cryptographically and sequentially assigned upon minting (no manual input required)
                </div>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(0,242,254,0.12)', color: 'var(--accent-cyan)', padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(0,242,254,0.3)' }}>
                AUTO-ASSIGNED
              </span>
            </div>

            <input className="input-3d" placeholder="Student Name" value={form.studentName} onChange={(e) => upd('studentName', e.target.value)} />
            <input className="input-3d" placeholder="Course / Credential" value={form.course} onChange={(e) => upd('course', e.target.value)} />
            <input className="input-3d" placeholder="Issuing Organisation" value={form.orgName} onChange={(e) => upd('orgName', e.target.value)} />

            <label className={`upload-zone ${file ? 'active' : ''}`} style={{ display: 'block' }}>
              <FileUp size={36} color={file ? 'var(--accent-cyan)' : 'var(--text-muted)'} style={{ marginBottom: 12, filter: file ? 'drop-shadow(0 0 10px var(--accent-cyan))' : 'none', transition: 'all 0.3s' }} />
              <h4 style={{ margin: '0 0 6px', color: file ? 'white' : 'var(--text-muted)', fontSize: '16px' }}>
                {file ? 'PDF Ready for AI Analysis' : 'Drag & Drop Certificate PDF'}
              </h4>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', opacity: 0.7 }}>
                <strong>Accepted:</strong> PDF only. Max 10MB.<br />
                <span style={{ color: 'var(--accent-red)' }}>Only certificate-format PDFs will pass AI validation.</span>
              </p>
              <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileSelect} />
              {file && (
                <div style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: 'rgba(0,242,254,0.1)', border: '1px solid rgba(0,242,254,0.3)', borderRadius: '99px', color: 'var(--accent-cyan)', fontSize: '12px', fontWeight: 600 }}>
                  📄 {file.name}
                  <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer' }}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </label>

            <button className="btn-3d issue-action-button" onClick={handleSingleIssue} disabled={busy}>
              {busy ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> <span>AI Analysis &amp; Signing in MetaMask...</span></div> : 'AI Guard & Sign Mint (MetaMask)'}
            </button>
            {!wallet.isConnected && (
              <p style={{ fontSize: '12px', color: '#f59e0b', margin: '10px 0 0', textAlign: 'center' }}>
                Connect your admin MetaMask wallet to sign the minting transaction.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div style={{ animation: 'slideUpFade 0.4s ease' }}>
          <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', borderLeft: '4px solid var(--accent-purple)' }}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text-main)', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} color="var(--accent-purple)" />
              Bulk Certificate Upload
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5, marginBottom: '16px' }}>
              Upload multiple PDF certificates at once. Each file is independently analyzed by the AI forensic engine and issued to the blockchain in a single batch transaction.
            </p>
            <input className="input-3d" placeholder="Issuing Organization" value={form.orgName} onChange={(e) => upd('orgName', e.target.value)} />
          </div>

          <label className={`upload-zone ${batchFiles.length > 0 ? 'active' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: batchFiles.length > 0 ? '80px' : '160px', padding: batchFiles.length > 0 ? '20px 24px' : '40px 24px', marginBottom: '20px', borderColor: 'rgba(168,85,247,0.3)', cursor: 'pointer' }} onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent-purple)'; }} onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; }} onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.pdf')); if (droppedFiles.length > 0) { const fakeEvent = { target: { files: droppedFiles, value: '' } }; handleBatchFileSelect(fakeEvent); } }}>
            <input type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={handleBatchFileSelect} />
            {batchFiles.length === 0 ? (
              <>
                <FileUp size={40} color="var(--accent-purple)" style={{ marginBottom: '12px', opacity: 0.6 }} />
                <h4 style={{ margin: '0 0 6px', color: 'var(--text-main)', fontSize: '16px' }}>Drop PDF Certificates Here</h4>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>or click to browse · Supports multiple PDF files</p>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <FileUp size={18} color="var(--accent-purple)" />
                <span style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: '14px' }}>{batchFiles.length} file{batchFiles.length > 1 ? 's' : ''} selected</span>
              </div>
            )}
          </label>

          {batchFiles.length > 0 && (
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Certificate Files ({batchFiles.length})</span>
                <button onClick={() => { setBatchFiles([]); setBatchToken(null); setReviewRows([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', fontSize: '12px', fontWeight: 600 }}>Clear All</button>
              </div>
            </div>
          )}

          {reviewRows.length > 0 && batchToken && (
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
              <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '12px' }}>Review extracted details before minting.</p>
              {reviewRows.map((row, i) => (
                <div key={i} style={{ padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '10px', marginBottom: '10px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '8px' }}>{row.fileName || 'Certificate'}</div>
                  {row.passed ? (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '10px' }}>
                      <input type="text" placeholder="Student Name" value={row.studentName || ''} onChange={(e) => updateReviewRow(i, 'studentName', e.target.value)} style={{ border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'var(--bg-dark)', color: 'var(--text-main)', outline: 'none', fontFamily: 'inherit' }} />
                      <input type="text" placeholder="Course / Degree" value={row.course || ''} onChange={(e) => updateReviewRow(i, 'course', e.target.value)} style={{ border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'var(--bg-dark)', color: 'var(--text-main)', outline: 'none', fontFamily: 'inherit' }} />
                      <input type="text" placeholder="Organization" value={row.orgName || ''} onChange={(e) => updateReviewRow(i, 'orgName', e.target.value)} style={{ border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'var(--bg-dark)', color: 'var(--text-main)', outline: 'none', fontFamily: 'inherit' }} />
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--accent-red)' }}>{row.error || row.aiMessage || 'This file will be skipped.'}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {batchProcessing && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Processing...</span>
                <span style={{ color: 'var(--accent-purple)', fontWeight: 700 }}>{batchProgress}%</span>
              </div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${batchProgress}%`, background: 'linear-gradient(90deg, transparent, var(--accent-purple))', boxShadow: '0 0 15px var(--accent-purple)', transition: 'width 0.3s ease' }} /></div>
            </div>
          )}

          {batchToken ? (
            <button className="btn-primary" onClick={handleMintReviewed} disabled={busy || reviewRows.filter((r) => r.passed).length === 0} style={{ width: '100%', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: 700, background: 'linear-gradient(135deg, var(--accent-green), #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', opacity: (busy || reviewRows.filter((r) => r.passed).length === 0) ? 0.6 : 1 }}>
              {busy ? <><RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />Minting Certificates...</> : <><Zap size={20} />Mint {reviewRows.filter((r) => r.passed).length} Reviewed Certificate{reviewRows.filter((r) => r.passed).length > 1 ? 's' : ''}</>}
            </button>
          ) : (
            <button className="btn-primary" onClick={handleAnalyzeBatch} disabled={analyzing || batchProcessing || batchFiles.length === 0} style={{ width: '100%', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: 700, background: 'linear-gradient(135deg, var(--accent-purple), #d946ef)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', opacity: (analyzing || batchProcessing || batchFiles.length === 0) ? 0.6 : 1 }}>
              {analyzing || batchProcessing ? <><RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />Analyzing Certificates with AI...</> : <><Sparkles size={20} />Analyze & Review {batchFiles.length > 0 ? `${batchFiles.length} Certificate${batchFiles.length > 1 ? 's' : ''}` : 'Certificates'}</>}
            </button>
          )}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '32px', animation: 'slideUpFade 0.5s ease' }}>
          {result.isBatch ? (
            <div className="glass-panel" style={{ padding: '28px', borderLeft: `4px solid ${result.status === 'BATCH_ISSUED' ? 'var(--accent-green)' : 'var(--accent-red)'}`, marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                {result.status === 'BATCH_ISSUED' ? <CheckCircle2 size={28} color="var(--accent-green)" /> : <XCircle size={28} color="var(--accent-red)" />}
                <div>
                  <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '18px' }}>{result.message}</h3>
                  {result.txHash && (
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Hash size={12} color="var(--accent-purple)" /> Tx:{' '}
                      <code style={{ color: 'var(--accent-purple)', fontSize: '11px', wordBreak: 'break-all' }}>{result.txHash.substring(0, 30)}...</code>
                    </p>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '12px' }}>
                <StatTile label="Total Files" value={result.totalFiles} color="var(--accent-blue)" />
                <StatTile label="Issued" value={result.mintedCount} color="var(--accent-green)" />
                <StatTile label="Rejected" value={result.rejectedCount || 0} color="var(--accent-red)" />
              </div>
            </div>
          ) : (
            <>
              <StatusBadge status={result.status} />
              {result.status === 'AI_REJECTED' && (
                <div style={{ padding: '16px', background: 'rgba(239,68,68,0.05)', border: '1px solid var(--accent-red)', borderRadius: '14px', marginBottom: '16px', fontSize: '14px', color: '#fca5a5', lineHeight: 1.5 }}>
                  <strong>AI Intercept:</strong> The document failed automated checks.
                </div>
              )}
              {result.status === 'ISSUED' && result.fileHash && (
                <div className="glass-panel" style={{ padding: isMobile ? '24px' : '32px', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)', border: '2px solid var(--accent-green)' }}>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: isMobile ? '22px' : '26px', color: 'var(--accent-green)', fontWeight: 700 }}>Certificate Successfully Issued</h2>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}><div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Certificate ID</div><code style={{ fontSize: '14px', color: 'var(--accent-purple)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{result.certId}</code></div>
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}><div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>AI Trust Score</div><div style={{ fontSize: '18px', fontWeight: 700, color: result.trust_score >= 70 ? 'var(--accent-green)' : result.trust_score >= 40 ? '#f59e0b' : 'var(--accent-red)' }}>{result.trust_score}%</div></div>
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}><div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Recipient Name</div><div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>{result.studentName}</div></div>
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}><div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Course / Credential</div><div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>{result.course}</div></div>
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}><div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Issuing Organization</div><div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>{result.orgName}</div></div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default IssueView;

