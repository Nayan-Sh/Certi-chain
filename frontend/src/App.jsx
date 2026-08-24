import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate, Outlet } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { ethers } from 'ethers';
import './index.css';
import Signup from './Signup';
import Login from './Login';
import Home from './Home';
import api, { authApi, historyApi } from './api';
import NETWORKS from './networks';
import { useWallet } from './hooks/useWallet';
import { useContract } from './hooks/useContract';
import ContractDeploy from './ContractDeploy';
import AppLogo from './components/ui/AppLogo';
import StatusBadge from './components/ui/StatusBadge';
import AiReportCard from './components/ui/AiReportCard';
import StatTile from './components/ui/StatTile';
import {
  genId,
  truncateAddress,
  fmtDateTime,
  computeFileHash,
  copyToClipboard,
  printHtml,
} from './utils/helpers';
import { buildReceiptHtml, buildCertificateHtml } from './utils/printTemplates';
import {
  ShieldCheck, FileSearch, ShieldAlert, FileUp, CheckCircle2,
  AlertCircle, XCircle, LayoutDashboard, Trash2, RefreshCw,
  ExternalLink, Sparkles, Copy, Hash, Download, Users, Wallet,
  Menu, X, Globe, ChevronRight, Award, Lock, Zap,
  Smartphone, QrCode, Fingerprint, Bell, Moon, Sun, Share2,
  History, TrendingUp, CheckCircle, AlertTriangle, Info,
  Printer, FileText, Medal, Calendar, Building2, User, BookOpen, LogOut,
  Layers, Boxes
} from 'lucide-react';

const configuredApiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
const API = configuredApiUrl
  ? (configuredApiUrl.endsWith('/api/certificates') ? configuredApiUrl : `${configuredApiUrl}/api/certificates`)
  : '/api/certificates';

// Authenticated axios client for private backend routes. Unlike the bare
// `axios` global, this attaches the JWT from localStorage to every request so
// protected endpoints (issue/batch/stats/verify/revoke/...) receive it. On a
// 401 (missing/expired token) it clears the session and bounces to /login.
const auth = axios.create();
auth.interceptors.request.use((config) => {
  const token = localStorage.getItem('certifychain_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
auth.interceptors.response.use(
  (res) => res,
  (err) => {
    const path = window.location.pathname;
    if (err.response?.status === 401 && path !== '/login' && path !== '/signup') {
      localStorage.removeItem('certifychain_token');
      localStorage.removeItem('certifychain_user');
      if (path !== '/') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Toast Notification System ──────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: 'var(--accent-green)',
    error: 'var(--accent-red)',
    warning: '#f59e0b',
    info: 'var(--accent-blue)'
  };

  const icons = {
    success: <CheckCircle size={18} />,
    error: <XCircle size={18} />,
    warning: <AlertTriangle size={18} />,
    info: <Info size={18} />
  };

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 10000,
      animation: 'slideInRight 0.3s ease',
      background: 'rgba(32, 59, 122, 0.95)',
      backdropFilter: 'blur(10px)',
      border: `1px solid ${colors[type]}`,
      borderRadius: '12px',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      color: colors[type],
      boxShadow: `0 10px 30px rgba(120, 112, 112, 0.5), 0 0 20px ${colors[type]}20`,
      maxWidth: '350px'
    }}>
      {icons[type]}
      <span style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '8px' }}>
        <X size={16} />
      </button>
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);
  const hideToast = useCallback(() => setToast(null), []);
  return { toast, showToast, hideToast };
}

// ── Loading Skeleton ───────────────────────────────────────────────────────
function Skeleton({ width, height }) {
  return (
    <div style={{
      width: width || '100%',
      height: height || '20px',
      background: 'linear-gradient(90deg, rgba(142, 140, 140, 0.63) 25%, rgba(123, 106, 106, 1) 50%, rgba(255,255,255,0.05) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      borderRadius: '8px'
    }} />
  );

}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ showToast, userRole }) {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (userRole === 'student') {
        const { data } = await historyApi.getHistory();
        setHistory(data);
      } else {
        const { data } = await auth.get(`${API}/stats`);
        setStats(data);
      }
    } catch {
      if (userRole !== 'student') setStats(null);
      showToast('Failed to load dashboard data', 'error');
    } finally { setLoading(false); }
  }, [showToast, userRole]);

  useEffect(() => { load(); }, [load]);

  const cards = stats ? [
    { label: 'Total Issued', value: stats.total, icon: Award, color: 'var(--accent-blue)', trend: '+12%' },
    { label: 'Issued Today', value: stats.issuedToday, icon: TrendingUp, color: 'var(--accent-green)', trend: '+5%' },
    { label: 'Revoked', value: stats.revoked, icon: ShieldAlert, color: 'var(--accent-red)', trend: '-2%' },
    { label: 'Avg AI Score', value: `${stats.avgAiScore}%`, icon: Zap, color: 'var(--accent-purple)', trend: 'Stable' },
  ] : [];

  if (userRole === 'student') {
    return (
      <div className="view-wrapper">
        <h1 className="title-glow">
          <LayoutDashboard size={28} color="var(--accent-purple)" />
          <span className="text-gradient">Student Dashboard</span>
        </h1>
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', marginTop: '24px', marginBottom: '24px' }}>
          <h2 style={{ color: 'var(--text-main)', marginBottom: '16px' }}>Welcome to your Student Portal</h2>
          <p style={{ color: 'var(--text-muted)' }}>You can view and verify the authenticity of your certificates on the blockchain using the Verify tab.</p>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={20} color="var(--accent-cyan)" /> Verification History
          </h3>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw className="spin" size={24} style={{ marginBottom: '12px' }} />
              <p>Loading your history...</p>
            </div>
          ) : history.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
              <FileSearch size={32} style={{ opacity: 0.5, margin: '0 auto 12px' }} />
              <p>You haven't verified any certificates yet.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '12px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Certificate ID</th>
                    <th style={{ padding: '12px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: '14px' }}>
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '16px 12px', fontWeight: '500', color: 'var(--text-main)', fontSize: '14px' }}>
                        <code style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '6px' }}>{entry.certificateId}</code>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        {entry.status === 'verified' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)', background: 'rgba(16,185,129,0.1)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                            <CheckCircle2 size={14} /> Verified
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--accent-red)', background: 'rgba(239,68,68,0.1)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                            <XCircle size={14} /> Invalid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="view-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <h1 className="title-glow">
          <LayoutDashboard size={28} color="var(--accent-cyan)" />
          <span className="text-gradient">Dashboard</span>
        </h1>
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '10px' }}>
          {['24h', '7d', '30d'].map(range => (
            <button
              key={range}
              onClick={() => setSelectedTimeRange(range)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: selectedTimeRange === range ? 'var(--accent-blue)' : 'transparent',
                color: selectedTimeRange === range ? '#fff' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {range === '24h' ? '24 Hours' : range === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-panel" style={{ padding: '24px' }}>
              <Skeleton width="40px" height="40px" />
              <div style={{ marginTop: '16px' }}><Skeleton width="60%" height="32px" /></div>
            </div>
          ))}
        </div>
      ) : !stats ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <AlertCircle size={48} color="var(--accent-red)" style={{ marginBottom: '16px' }} />
          <p style={{ color: 'var(--accent-red)' }}>Backend connection failed. Is Hardhat / Node running?</p>
          <button onClick={load} className="btn-3d" style={{ marginTop: '16px' }}>Retry Connection</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px', marginBottom: '24px', perspective: '1000px' }}>
            {cards.map((c, i) => (
              <div key={c.label} className="stat-card stagger-item" style={{ animationDelay: `${i * 0.1}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <c.icon size={28} color={c.color} style={{ filter: `drop-shadow(0 4px 8px ${c.color}66)` }} />
                  <span style={{ fontSize: '11px', color: c.trend.startsWith('+') ? 'var(--accent-green)' : c.trend.startsWith('-') ? 'var(--accent-red)' : 'var(--text-muted)', fontWeight: 600 }}>
                    {c.trend}
                  </span>
                </div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: c.color, textShadow: `0 0 20px ${c.color}66` }}>{c.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div className="stagger-item" style={{ animationDelay: '0.4s', display: 'flex', gap: '12px', marginBottom: '32px', justifyContent: 'center' }}>
            <button
              onClick={async () => {
                if (!window.confirm("Are you sure you want to delete ALL metadata?")) return;
                try {
                  await auth.delete(`${API}/clear`);
                  load();
                  showToast('Data cleared successfully', 'success');
                } catch (err) {
                  showToast('Failed to clear data: ' + err.message, 'error');
                }
              }}
              className="btn-danger" style={{ flex: 1, padding: '14px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', fontSize: '15px', fontWeight: 700, boxShadow: '0 8px 16px rgba(239,68,68,0.2)' }}
            >
              <Trash2 size={18} /> Clear All Data
            </button>
            <button onClick={load} className="btn-3d" style={{
              flex: 1, padding: '14px 24px', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700
            }}>
              <RefreshCw size={18} /> Refresh Dashboard
            </button>
          </div>

          {stats.recent?.length > 0 && (
            <div className="stagger-item" style={{ animationDelay: '0.5s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-blue)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                  <History size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Live Chain Activity
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{stats.recent.length} recent</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {stats.recent.map((c, idx) => (
                  <div key={c.id} className="recent-row" style={{ animationDelay: `${idx * 0.05}s` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: c.revoked ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {c.revoked ? <XCircle size={18} color="var(--accent-red)" /> : <CheckCircle size={18} color="var(--accent-green)" />}
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: 'white', marginBottom: '2px' }}>{c.studentName}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.course}</div>
                        <div style={{
                          fontSize: '11px', color: 'var(--accent-purple)',
                          fontFamily: 'monospace', marginTop: '3px',
                          background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.15)',
                          padding: '2px 6px', borderRadius: '6px', display: 'inline-block',
                        }}>
                          ID: {c.id}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="badge-outline" style={{
                        background: c.revoked ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                        color: c.revoked ? 'var(--accent-red)' : 'var(--accent-green)',
                        borderColor: c.revoked ? 'var(--accent-red)' : 'var(--accent-green)'
                      }}>
                        {c.revoked ? 'REVOKED' : 'VALID'}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-purple)' }}>
                        {c.aiScore ?? '—'}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Issue View ─────────────────────────────────────────────────────────────
function IssueView({ showToast, wallet, contract }) {
  const [mode, setMode] = useState('single');
  const [form, setForm] = useState({ id: genId(), studentName: '', course: '', orgName: 'CertifyChain Institute', studentEmail: '' });
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [batchFiles, setBatchFiles] = useState([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [batchToken, setBatchToken] = useState(null);
  const [reviewRows, setReviewRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const isMobile = window.innerWidth <= 768;

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const newBatchFiles = files.map(file => ({ id: genId(), file, studentName: '', course: '' }));
    setBatchFiles(prev => [...prev, ...newBatchFiles]);
    setResult(null);
    setBatchToken(null);
    setReviewRows([]);
    e.target.value = '';
  };

  const removeBatchFile = (id) => {
    setBatchFiles(prev => prev.filter(f => f.id !== id));
    setBatchToken(null);
    setReviewRows([]);
  };

  const updateReviewRow = (idx, field, value) => {
    setReviewRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
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
    batchFiles.forEach(f => formData.append('files', f.file));
    setBatchProgress(10);

    try {
      const res = await auth.post(`${API}/analyze-batch`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) {
            setBatchProgress(10 + Math.round((e.loaded / e.total) * 60));
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

    const certificates = reviewRows.filter(r => r.passed).map(r => ({
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
      const prep = await auth.post(`${API}/prepare-batch-mint`, { token: batchToken, certificates, orgName: form.orgName });
      const records = prep.data?.records;
      if (!prep.data?.success || !Array.isArray(records) || records.length === 0) {
        throw new Error(prep.data?.message || 'Preparation failed — no records returned.');
      }

      const txHash = await contract.batchIssue(
        wallet.chainId,
        records.map(r => r.id),
        records.map(r => r.studentName),
        records.map(r => r.course),
        records.map(r => r.orgName),
        records.map(r => r.ipfsHash),
        records.map(r => r.hash),
      );

      const res = await auth.post(`${API}/record-mint`, {
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
    if (!file || !form.id) {
      showToast('Upload a file and fill all fields!', 'warning');
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
    setUploadProgress(0);

    try {
      const payload = new FormData();
      payload.append('file', file);
      Object.entries(form).forEach(([k, v]) => payload.append(k, v));

      const prep = await auth.post(`${API}/prepare-single`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
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

      const res = await auth.post(`${API}/record-mint`, {
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
        setForm(f => ({ ...f, id: genId() }));
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
      setUploadProgress(0);
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
              <input className="input-3d" placeholder="Issuing Organization" value={form.orgName} onChange={e => upd('orgName', e.target.value)} />
              <input className="input-3d" placeholder="Student Email (optional — certificate emailed after minting)" type="email" value={form.studentEmail} onChange={e => upd('studentEmail', e.target.value)} />
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 20px', color: 'var(--text-main)', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Hash size={16} color="var(--accent-cyan)" />
              Certificate Details
            </h4>

            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Certificate ID
              </label>
              <div style={{ position: 'relative' }}>
                <input className="input-3d" value={form.id} placeholder="Auto-generated or enter custom ID" onChange={e => upd('id', e.target.value)} style={{ paddingRight: '120px' }} />
                <button onClick={() => upd('id', genId())} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,242,254,0.1)', border: '1px solid var(--accent-cyan)', color: 'var(--accent-cyan)', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'translateY(-50%) scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'translateY(-50%) scale(1)'}>
                  <Sparkles size={12} /> Auto-Generate
                </button>
              </div>
            </div>

            <input className="input-3d" placeholder="Student Name" value={form.studentName} onChange={e => upd('studentName', e.target.value)} />
            <input className="input-3d" placeholder="Course / Credential" value={form.course} onChange={e => upd('course', e.target.value)} />
            <input className="input-3d" placeholder="Issuing Organisation" value={form.orgName} onChange={e => upd('orgName', e.target.value)} />
            <input className="input-3d" placeholder="Student Email (optional — certificate emailed here after minting)" type="email" value={form.studentEmail} onChange={e => upd('studentEmail', e.target.value)} />

            <label className={`upload-zone ${file ? 'active' : ''}`} style={{ display: 'block' }}>
              <FileUp size={36} color={file ? 'var(--accent-cyan)' : 'var(--text-muted)'} style={{ marginBottom: 12, filter: file ? 'drop-shadow(0 0 10px var(--accent-cyan))' : 'none', transition: 'all 0.3s' }} />
              <h4 style={{ margin: '0 0 6px', color: file ? 'white' : 'var(--text-muted)', fontSize: '16px' }}>
                {file ? 'PDF Ready for AI Analysis' : 'Drag & Drop Certificate PDF'}
              </h4>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', opacity: 0.7 }}>
                <strong>Accepted:</strong> PDF only. Max 10MB. <br />
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
            <input className="input-3d" placeholder="Issuing Organization" value={form.orgName} onChange={e => upd('orgName', e.target.value)} />
          </div>

          <label className={`upload-zone ${batchFiles.length > 0 ? 'active' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: batchFiles.length > 0 ? '80px' : '160px', padding: batchFiles.length > 0 ? '20px 24px' : '40px 24px', marginBottom: '20px', borderColor: 'rgba(168,85,247,0.3)', cursor: 'pointer' }} onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent-purple)'; }} onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; }} onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf')); if (droppedFiles.length > 0) { const fakeEvent = { target: { files: droppedFiles, value: '' } }; handleBatchFileSelect(fakeEvent); } }}>
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
                <span style={{ padding: '4px 10px', borderRadius: '99px', background: 'rgba(168,85,247,0.1)', color: 'var(--accent-purple)', fontSize: '11px', fontWeight: 600 }}>Click to add more</span>
              </div>
            )}
          </label>

          {batchFiles.length > 0 && (
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Certificate Files ({batchFiles.length})</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(168,85,247,0.08)', border: '1px dashed rgba(168,85,247,0.35)', padding: '2px 8px', borderRadius: '6px' }}>✨ Student &amp; course auto-extracted by AI</span>
                <button onClick={() => { setBatchFiles([]); setBatchToken(null); setReviewRows([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', fontSize: '12px', fontWeight: 600 }}>Clear All</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
                {batchFiles.map((bf, idx) => {
                  const row = reviewRows[idx];
                  return (
                    <div key={bf.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : 'minmax(0,2fr) auto auto', gap: '10px', alignItems: 'center', padding: '12px 14px', background: 'rgba(0,0,0,0.04)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden' }}>
                        <FileText size={14} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bf.file.name}</span>
                      </div>
                      {row ? (
                        <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, background: row.passed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: row.passed ? 'var(--accent-green)' : 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                          {row.passed ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                          {row.passed ? `AI ${row.aiScore}%` : (row.status === 'AI_ERROR' ? 'AI Error' : 'Rejected')}
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pending</span>
                      )}
                      <button onClick={() => removeBatchFile(bf.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', padding: '4px', opacity: 0.6 }} title="Remove file"><X size={18} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {reviewRows.length > 0 && batchToken && (
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Sparkles size={16} color="var(--accent-purple)" />
                <h4 style={{ margin: 0, color: 'var(--text-main)', fontSize: '15px', fontWeight: 700 }}>Review Extracted Details</h4>
              </div>
              <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '12px' }}>The AI read these values from each PDF. Correct any mistakes below — certificates are minted exactly as shown.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto' }}>
                {reviewRows.map((row, i) => {
                  const isPassed = !!row.passed;
                  return (
                    <div key={i} style={{ padding: '14px', borderRadius: '10px', background: isPassed ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)', border: `1px solid ${isPassed ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1' }}>
                          <FileText size={14} style={{ flexShrink: 0 }} color={isPassed ? 'var(--accent-green)' : 'var(--accent-red)'} />
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.fileName}</span>
                        </div>
                        <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, background: isPassed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: isPassed ? 'var(--accent-green)' : 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                          {isPassed ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                          {isPassed ? `AI Trust Score: ${row.aiScore}%` : (row.status === 'AI_ERROR' ? 'AI Error' : 'Rejected by AI')}
                        </span>
                      </div>

                      {isPassed ? (
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '10px' }}>
                          <input type="text" placeholder="Student Name" value={row.studentName || ''} onChange={e => updateReviewRow(i, 'studentName', e.target.value)} style={{ border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'var(--bg-dark)', color: 'var(--text-main)', outline: 'none', fontFamily: 'inherit' }} />
                          <input type="text" placeholder="Course / Degree" value={row.course || ''} onChange={e => updateReviewRow(i, 'course', e.target.value)} style={{ border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'var(--bg-dark)', color: 'var(--text-main)', outline: 'none', fontFamily: 'inherit' }} />
                          <input type="text" placeholder="Organization" value={row.orgName || ''} onChange={e => updateReviewRow(i, 'orgName', e.target.value)} style={{ border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'var(--bg-dark)', color: 'var(--text-main)', outline: 'none', fontFamily: 'inherit' }} />
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--accent-red)', padding: '4px 2px' }}>{row.error || row.aiMessage || 'This file will be skipped — not minted.'}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {batchProcessing && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Processing...</span>
                <span style={{ color: 'var(--accent-purple)', fontWeight: 700 }}>{batchProgress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${batchProgress}%`, background: 'linear-gradient(90deg, transparent, var(--accent-purple))', boxShadow: '0 0 15px var(--accent-purple)', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}

          {batchToken ? (
            <button className="btn-primary" onClick={handleMintReviewed} disabled={busy || reviewRows.filter(r => r.passed).length === 0} style={{ width: '100%', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: 700, background: 'linear-gradient(135deg, var(--accent-green), #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', opacity: (busy || reviewRows.filter(r => r.passed).length === 0) ? 0.6 : 1 }}>
              {busy ? (
                <>
                  <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  Minting Certificates...
                </>
              ) : (
                <>
                  <Zap size={20} />
                  Mint {reviewRows.filter(r => r.passed).length} Reviewed Certificate{reviewRows.filter(r => r.passed).length > 1 ? 's' : ''}
                </>
              )}
            </button>
          ) : (
            <button className="btn-primary issue-action-button" onClick={handleAnalyzeBatch} disabled={analyzing || batchProcessing || batchFiles.length === 0} style={{ width: '100%', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: 700, background: 'linear-gradient(135deg, var(--accent-purple), #d946ef)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', opacity: (analyzing || batchProcessing || batchFiles.length === 0) ? 0.6 : 1 }}>
              {analyzing || batchProcessing ? (
                <>
                  <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  Analyzing Certificates with AI...
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  Analyze &amp; Review {batchFiles.length > 0 ? `${batchFiles.length} Certificate${batchFiles.length > 1 ? 's' : ''}` : 'Certificates'}
                </>
              )}
            </button>
          )}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '32px', animation: 'slideUpFade 0.5s ease' }}>
          {result.isBatch ? (
            <div style={{ animation: 'slideUpFade 0.5s ease' }}>
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

              {result.batchResults && result.batchResults.length > 0 && (
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <h4 style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Individual File Results</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '500px', overflowY: 'auto' }}>
                    {result.batchResults.map((fr, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto', gap: '10px', alignItems: 'center', padding: '12px 14px', borderRadius: '10px', background: fr.passed ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)', border: `1px solid ${fr.passed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{fr.status === 'AI_ERROR' && '⚠️ '}{fr.studentName}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fr.course}</div>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fr.fileName || ''}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                          {fr.certificateId ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <code style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: 'var(--accent-purple)', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, fontFamily: 'monospace' }}>{fr.certificateId}</code>
                                <button onClick={() => copyToClipboard(fr.certificateId, showToast)} title="Copy certificate ID" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-purple)', padding: '2px', display: 'inline-flex' }}><Copy size={13} /></button>
                                <button onClick={() => copyToClipboard(`${window.location.origin}/?verify=${fr.certificateId}`, showToast)} title="Copy verify link" style={{ background: 'rgba(0,242,254,0.1)', border: '1px solid var(--accent-cyan)', color: 'var(--accent-cyan)', cursor: 'pointer', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Share2 size={11} /> Link</button>
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Certificate ID</div>
                            </>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </div>
                        <div style={{ padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, background: fr.passed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: fr.passed ? 'var(--accent-green)' : 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                          {fr.passed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {fr.status === 'AI_ERROR' ? 'Error' : `Score: ${fr.aiScore}%`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <StatusBadge status={result.status} />

              {result.status === 'AI_REJECTED' && (
                <div style={{ padding: '16px', background: 'rgba(239,68,68,0.05)', border: '1px solid var(--accent-red)', borderRadius: '14px', marginBottom: '16px', fontSize: '14px', color: '#fca5a5', lineHeight: 1.5, boxShadow: 'inset 0 0 20px rgba(239,68,68,0.1)' }}>
                  <strong>AI Intercept:</strong> The document failed automated checks. See the detailed forensic report below.
                </div>
              )}

              {result.status === 'ISSUED' && result.fileHash && (
                <div className="glass-panel" style={{ padding: isMobile ? '24px' : '32px', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)', border: '2px solid var(--accent-green)', position: 'relative' }}>
                  <div style={{ textAlign: 'center', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 30px rgba(16, 185, 129, 0.5)' }}>
                      <CheckCircle2 size={32} color="white" />
                    </div>
                    <h2 style={{ margin: 0, fontSize: isMobile ? '22px' : '26px', color: 'var(--accent-green)', fontWeight: 700 }}>Certificate Successfully Issued</h2>
                    <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>Secured on Blockchain with AI Verification</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Certificate ID</div>
                      <code style={{ fontSize: '14px', color: 'var(--accent-purple)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{result.certId}</code>
                    </div>
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>AI Trust Score</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: result.trust_score >= 70 ? 'var(--accent-green)' : result.trust_score >= 40 ? '#f59e0b' : 'var(--accent-red)' }}>{result.trust_score}%</div>
                    </div>
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Recipient Name</div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>{result.studentName}</div>
                    </div>
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Course / Credential</div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>{result.course}</div>
                    </div>
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Issuing Organization</div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>{result.orgName}</div>
                    </div>
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', gridColumn: isMobile ? '1' : '1 / -1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Immutable File Hash (SHA-256)</span>
                        <button onClick={() => copyToClipboard(result.fileHash, showToast)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Copy size={14} /></button>
                      </div>
                      <code style={{ fontSize: '12px', color: 'var(--accent-cyan)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{result.fileHash}</code>
                    </div>
                  </div>

                  {result.txHash && (
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Blockchain Transaction</span>
                        <button onClick={() => copyToClipboard(result.txHash, showToast)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Copy size={14} /></button>
                      </div>
                      <code style={{ fontSize: '12px', color: 'var(--accent-purple)', fontFamily: 'monospace', wordBreak: 'break-all', display: 'block', marginBottom: '12px' }}>{result.txHash}</code>
                      <a href={`${NETWORKS[result.chainId || 11155111]?.blockExplorerUrls?.[0] || 'https://sepolia.etherscan.io'}/tx/${result.txHash}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--accent-cyan)', textDecoration: 'none' }}><ExternalLink size={12} /> View on {(NETWORKS[result.chainId || 11155111]?.name || 'Sepolia')} Explorer</a>
                    </div>
                  )}

                  <div style={{ textAlign: 'center', padding: '24px', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-muted)' }}><QrCode size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> Scan to Verify Certificate</p>
                    <div style={{ display: 'inline-block', padding: '16px', background: 'white', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
                      <QRCodeSVG value={`${window.location.protocol}//${window.location.host}/?verify=${result.certId}`} size={isMobile ? 140 : 160} />
                    </div>
                    <p style={{ margin: '12px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>{window.location.protocol}//{window.location.host}/?verify={result.certId}</p>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
                    <button onClick={() => printHtml('CertifyChain Receipt', buildReceiptHtml(result))} className="btn-3d" style={{ flex: 1, minWidth: '140px', padding: '14px 24px', fontSize: '14px', background: 'transparent', border: '1px solid var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Printer size={18} /> Print Receipt</button>
                    <button onClick={() => copyToClipboard(`${window.location.origin}/?verify=${result.certId}`, showToast)} className="btn-3d" style={{ flex: 1, minWidth: '140px', padding: '14px 24px', fontSize: '14px', background: 'transparent', border: '1px solid var(--accent-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Share2 size={18} /> Share Link</button>
                    {result.ipfsHash && result.ipfsHash.startsWith('Qm') && result.ipfsHash.length === 46 && (
                      <a href={`https://gateway.pinata.cloud/ipfs/${result.ipfsHash}`} target="_blank" rel="noopener noreferrer" className="btn-3d" style={{ flex: 1, minWidth: '140px', padding: '14px 24px', fontSize: '14px', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', textDecoration: 'none', color: '#020617' }}><ExternalLink size={18} /> View on IPFS</a>
                    )}
                    <button onClick={() => { setResult(null); setForm({ id: genId(), studentName: '', course: '', orgName: form.orgName, studentEmail: '' }); setFile(null); }} className="btn-3d" style={{ flex: 1, minWidth: '140px', padding: '14px 24px', fontSize: '14px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><FileUp size={18} /> Issue Another</button>
                  </div>

                  <div className="printable-receipt" style={{ display: 'none' }}>
                    <div style={{ padding: '40px', background: 'white', color: 'black', fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
                      <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '2px solid #333', paddingBottom: '20px' }}>
                        <AppLogo size={52} />
                        <h1 style={{ margin: '0 0 6px 0', fontSize: '26px', color: '#0f172a' }}>CertifyChain</h1>
                        <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>Blockchain Certificate Verification System</p>
                      </div>

                      <h2 style={{ textAlign: 'center', marginBottom: '24px', color: '#0d9488' }}>CERTIFICATE ISSUANCE RECEIPT</h2>
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: '12px 0', fontWeight: 'bold', width: '40%' }}>Receipt / Certificate ID:</td><td style={{ padding: '12px 0', fontFamily: 'monospace' }}>{result.certId}</td></tr>
                          <tr style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: '12px 0', fontWeight: 'bold' }}>Recipient Name:</td><td style={{ padding: '12px 0' }}>{result.studentName}</td></tr>
                          <tr style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: '12px 0', fontWeight: 'bold' }}>Course / Credential:</td><td style={{ padding: '12px 0' }}>{result.course}</td></tr>
                          <tr style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: '12px 0', fontWeight: 'bold' }}>Issuing Organization:</td><td style={{ padding: '12px 0' }}>{result.orgName}</td></tr>
                          <tr style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: '12px 0', fontWeight: 'bold' }}>Issue Date:</td><td style={{ padding: '12px 0' }}>{(fmtDateTime(result.issuedAt) || {}).date || '—'}</td></tr>
                          <tr style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: '12px 0', fontWeight: 'bold' }}>Issue Time:</td><td style={{ padding: '12px 0' }}>{(fmtDateTime(result.issuedAt) || {}).time || '—'}</td></tr>
                          <tr style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: '12px 0', fontWeight: 'bold' }}>Status:</td><td style={{ padding: '12px 0', color: '#0d9488', fontWeight: 'bold' }}>ISSUED / ACTIVE</td></tr>
                          <tr style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: '12px 0', fontWeight: 'bold' }}>AI Trust Score:</td><td style={{ padding: '12px 0' }}>{result.trust_score}%</td></tr>
                        </tbody>
                      </table>
                      <div style={{ marginBottom: '20px' }}><p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '12px', color: '#666' }}>BLOCKCHAIN TRANSACTION HASH:</p><p style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>{result.txHash}</p></div>
                      <div style={{ marginBottom: '20px' }}><p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '12px', color: '#666' }}>FILE HASH (SHA-256):</p><p style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>{result.fileHash}</p></div>
                      <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #ddd', textAlign: 'center' }}><p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#666' }}>Scan to verify this certificate</p><div style={{ display: 'inline-block', padding: '12px', background: 'white', border: '1px solid #ddd', borderRadius: '8px' }}><QRCodeSVG value={`${window.location.protocol}//${window.location.host}/?verify=${result.certId}`} size={128} /></div><p style={{ margin: '10px 0 0 0', fontFamily: 'monospace', fontSize: '11px', color: '#333', wordBreak: 'break-all' }}>{window.location.origin}/?verify={result.certId}</p></div>
                      <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '11px', color: '#999' }}><p>Printed On: {new Date().toLocaleString()}</p><p>This receipt was generated automatically by CertifyChain.</p><p>Blockchain-secured certificate verification system.</p></div>
                    </div>
                  </div>
                </div>
              )}

              <AiReportCard trust_score={result.trust_score} details={result.details} ai_safe={result.ai_safe} ai_message={result.ai_message} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Verify View ────────────────────────────────────────────────────────────
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
      const res = await auth.post(`${API}/record-claim-sbt`, {
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
      const res = await auth.get(`${API}/verify/${cleanId}`, { params: fileHash ? { fileHash } : {} });
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

// ── Revoke View ────────────────────────────────────────────────────────────
function RevokeView({ showToast, wallet, contract }) {
  const [certId, setCertId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const isMobile = window.innerWidth <= 768;

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
      const res = await auth.post(`${API}/record-revoke`, {
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

// ── Mobile Digital Portfolio View ──────────────────────────────────────────
function PortfolioView({ certId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await auth.get(`${API}/verify/${certId}`);
        setResult({
          status: res.data.hashMatch === true ? 'VERIFIED' : res.data.hashMatch === false ? 'TAMPERED' : 'FOUND_NO_FILE',
          ...res.data,
        });
      } catch (err) {
        if (err.response?.status === 404) {
          setResult({ status: 'NOT_FOUND', error: 'Certificate not found.' });
        } else {
          setResult({ error: err.response?.data?.error || err.message });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [certId]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
        <RefreshCw size={40} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (result?.error || result?.status === 'NOT_FOUND') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', border: '1px solid var(--accent-red)' }}>
          <XCircle size={60} color="var(--accent-red)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ color: 'white', marginBottom: '8px' }}>Invalid Certificate</h2>
          <p style={{ color: 'var(--text-muted)' }}>This certificate ID could not be found on the blockchain ledger.</p>
        </div>
      </div>
    );
  }

  // Display Mobile-friendly Valid Certificate
  return (
    <div style={{ minHeight: '100vh', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '32px 24px', textAlign: 'center', animation: 'slideUpFade 0.6s ease', position: 'relative', overflow: 'hidden' }}>

        {/* Glow behind */}
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '150px', height: '150px', background: result.revoked ? 'var(--accent-red)' : 'var(--accent-green)', filter: 'blur(80px)', opacity: 0.2, zIndex: -1 }} />

        {result.revoked ? (
          <ShieldAlert size={64} color="var(--accent-red)" style={{ margin: '0 auto 20px', filter: 'drop-shadow(0 0 20px rgba(239,68,68,0.5))' }} />
        ) : (
          <ShieldCheck size={64} color="var(--accent-green)" style={{ margin: '0 auto 20px', filter: 'drop-shadow(0 0 20px rgba(16,185,129,0.5))' }} />
        )}

        <h1 style={{ fontSize: '24px', color: 'white', margin: '0 0 8px', letterSpacing: '-0.03em' }}>
          {result.revoked ? 'Certificate Revoked' : 'Verified Authentic'}
        </h1>
        <p style={{ color: result.revoked ? 'var(--accent-red)' : 'var(--accent-green)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, margin: '0 0 32px' }}>
          Blockchain Secured Record
        </p>

        <div style={{ textAlign: 'left', background: 'rgba(0,0,0,0.4)', borderRadius: '16px', padding: '20px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Recipient</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'white' }}>{result.studentName}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Credential</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent-cyan)' }}>{result.course}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Issuer</div>
            <div style={{ fontSize: '15px', color: 'white' }}>{result.orgName}</div>
          </div>
          {result.issuedAt && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Date Minted</div>
              <div style={{ fontSize: '15px', color: 'var(--text-muted)' }}>{new Date(result.issuedAt).toLocaleDateString()}</div>
            </div>
          )}
        </div>

        {result.txHash && (
          <div style={{ marginTop: '24px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Blockchain Transaction Hash</div>
            <code style={{ fontSize: '11px', color: 'var(--accent-purple)', wordBreak: 'break-all', display: 'block', background: 'rgba(168,85,247,0.1)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(168,85,247,0.2)' }}>
              {result.txHash}
            </code>
          </div>
        )}

      </div>
    </div>
  );
}

// ── App Shell ──────────────────────────────────────────────────────────────
function AppShell({ userRole, handleLogout, showToast, isMobile, isMobileMenuOpen, setIsMobileMenuOpen, deferredPrompt, handleInstallClick, navItems, wallet }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Determine current active view from pathname
  const currentPath = location.pathname.split('/')[1] || 'dashboard';

  return (
    <div className="app-container">
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {/* Mobile Header */}
      {isMobile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '60px',
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 1000,
          color: 'var(--text-main)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} onClick={() => navigate('/')} className="cursor-pointer">
            <div style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', padding: '8px', borderRadius: '10px' }}>
              <ShieldCheck size={20} color="#020617" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '16px' }}>CertifyChain</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {wallet.isConnected ? (
              <div style={{
                padding: '6px 12px',
                background: 'rgba(16,185,129,0.2)',
                borderRadius: '20px',
                fontSize: '12px',
                color: 'var(--accent-green)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-green)' }} />
                {truncateAddress(wallet.account)}
              </div>
            ) : (
              <button
                onClick={() => wallet.connect().catch(e => showToast(e.message, 'error'))}
                disabled={wallet.isConnecting}
                style={{
                  padding: '8px 16px',
                  background: 'var(--accent-blue)',
                  border: 'none',
                  borderRadius: '20px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Wallet size={14} />
                {wallet.isConnecting ? '...' : 'Connect'}
              </button>
            )}
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} style={{ background: 'none', border: 'none', color: 'var(--text-main)' }}>
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      )}

      {/* Mobile Menu Overlay */}
      {isMobile && isMobileMenuOpen && (
        <div style={{
          position: 'fixed',
          top: '60px',
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(255,255,255,0.98)',
          zIndex: 999,
          padding: '20px',
          animation: 'slideUpFade 0.3s ease'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {navItems.map(n => (
              <button
                key={n.key}
                onClick={() => { navigate(n.key === 'home' ? '/' : `/${n.key}`); setIsMobileMenuOpen(false); }}
                style={{
                  padding: '16px 20px',
                  background: currentPath === n.key ? 'rgba(29,78,216,0.08)' : 'transparent',
                  border: currentPath === n.key ? '1px solid var(--accent-blue)' : '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  color: currentPath === n.key ? 'var(--accent-blue)' : 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '16px',
                  fontWeight: 500
                }}
              >
                <n.icon size={20} />
                {n.label}
                {n.badge && <span style={{ marginLeft: 'auto', background: 'var(--accent-red)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>{n.badge}</span>}
              </button>
            ))}
            {deferredPrompt && (
              <button onClick={handleInstallClick} style={{ marginTop: '20px', padding: '16px', background: 'var(--glass-bg)', border: '1px solid var(--accent-purple)', borderRadius: '12px', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Download size={18} /> Install App
              </button>
            )}
            {userRole && (
              <button onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }} style={{ marginTop: '20px', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <LogOut size={18} /> Log Out
              </button>
            )}
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className="sidebar">
          <div onClick={() => navigate('/')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '40px', padding: '10px 8px', perspective: '500px' }}>
            <div style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', padding: '10px', borderRadius: '14px', boxShadow: '0 10px 20px rgba(0,242,254,0.3)', transform: 'translateZ(10px)' }}>
              <ShieldCheck size={28} color="#020617" />
            </div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '18px', letterSpacing: '-0.02em', color: 'var(--text-main)' }}>CertifyChain</div>
              <div style={{ fontSize: '10px', color: 'var(--accent-purple)', marginTop: '2px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Blockchain Secured</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '24px' }}>
            {navItems.map(n => (
              <button key={n.key} onClick={() => navigate(n.key === 'home' ? '/' : `/${n.key}`)} className={`nav-item ${currentPath === n.key ? 'active' : ''}`}>
                <span style={{ opacity: currentPath === n.key ? 1 : 0.6, display: 'flex', alignItems: 'center' }}><n.icon size={18} /></span>
                <span style={{ marginLeft: '12px', letterSpacing: '0.03em' }}>{n.label}</span>
                {n.badge && <span style={{ marginLeft: 'auto', background: 'var(--accent-red)', padding: '2px 8px', borderRadius: '10px', fontSize: '10px' }}>{n.badge}</span>}
              </button>
            ))}
            {deferredPrompt && (
              <button onClick={handleInstallClick} className="nav-item" style={{ marginTop: '16px', background: 'var(--glass-bg)', border: '1px solid var(--accent-purple)', color: 'var(--accent-purple)' }}>
                <span style={{ display: 'flex', alignItems: 'center' }}><Download size={18} /></span>
                <span style={{ marginLeft: '12px', letterSpacing: '0.03em', fontWeight: 700 }}>Install App</span>
              </button>
            )}
            {userRole && (
              <button onClick={handleLogout} className="nav-item" style={{ marginTop: '8px', background: 'rgba(239, 68, 68, 0.05)', color: 'var(--accent-red)' }}>
                <span style={{ display: 'flex', alignItems: 'center' }}><LogOut size={18} /></span>
                <span style={{ marginLeft: '12px', letterSpacing: '0.03em', fontWeight: 600 }}>Log Out</span>
              </button>
            )}
          </div>

          <div style={{ marginTop: 'auto', padding: '20px', background: 'rgba(0,0,0,0.3)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
            <h4 style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>System Status</h4>
            <div style={{ fontSize: '11px', color: 'white', display: 'flex', flexDirection: 'column', gap: '8px', fontWeight: 500 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent-green)', boxShadow: '0 0 5px var(--accent-green)' }} /> Blockchain Node</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent-green)', boxShadow: '0 0 5px var(--accent-green)' }} /> IPFS Storage</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent-purple)', boxShadow: '0 0 5px var(--accent-purple)' }} /> AI Neural Net</div>
            </div>
          </div>
        </aside>
      )}

      <main className="main-content" style={{ marginTop: isMobile ? '60px' : 0 }}>
        <div style={{ margin: '0 auto', width: '100%', maxWidth: '900px', padding: isMobile ? '20px' : '48px', minHeight: isMobile ? 'calc(100vh - 80px)' : 'calc(100vh - 60px)' }}>
          <Outlet />
        </div>

        {/* ── Legal Footer ─────────────────────────────────────────────── */}
        <footer style={{
          textAlign: 'center',
          padding: '20px 16px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--glass-border)',
          marginTop: '8px'
        }}>
          &copy; {new Date().getFullYear()} CertifyChain &nbsp;|&nbsp;
          <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }}>Privacy Policy</a>
          &nbsp;|&nbsp;
          <a href="/terms-of-service.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }}>Terms of Service</a>
        </footer>
      </main>
    </div>
  );
}

// ── App Router Wrapper ────────────────────────────────────────────────────────
export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, showToast, hideToast } = useToast();

  const [userRole, setUserRole] = useState(() => {
    const savedUser = localStorage.getItem('certifychain_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser).role || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const handleLogout = () => {
    localStorage.removeItem('certifychain_token');
    localStorage.removeItem('certifychain_user');
    setUserRole(null);
    navigate('/');
    showToast('Logged out successfully', 'info');
  };

  const [portfolioId] = useState(() => new URLSearchParams(window.location.search).get('verify'));
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const wallet = useWallet();
  const contract = useContract();
  const isMobile = window.innerWidth <= 768;

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        showToast('App installed successfully!', 'success');
      }
    }
  };

  if (portfolioId) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
        <PortfolioView certId={portfolioId} />
      </>
    );
  }

  let navItems = [];
  if (userRole === 'student') {
    navItems = [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: null },
      { key: 'verify', label: 'Verify', icon: FileSearch, badge: null },
    ];
  } else if (userRole === 'admin' || localStorage.getItem('certifychain_token')) {
    navItems = [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: null },
      { key: 'verify', label: 'Verify', icon: FileSearch, badge: null },
      { key: 'issue', label: 'Issue Cert', icon: FileUp, badge: null },
      { key: 'revoke', label: 'Revoke', icon: Trash2, badge: null },
    ];
    // Admin-only: deploy the smart contracts from a connected MetaMask wallet.
    if (userRole === 'admin') {
      navItems.push({ key: 'deploy', label: 'Deploy Contracts', icon: Boxes, badge: null });
    }
  } else {
    // Guest
    navItems = [
      { key: 'home', label: 'Back to Home', icon: LayoutDashboard, badge: null },
      { key: 'verify', label: 'Verify Certificate', icon: FileSearch, badge: null },
    ];
  }

  // Shell Props
  const shellProps = {
    userRole, handleLogout, showToast, isMobile, isMobileMenuOpen, setIsMobileMenuOpen,
    deferredPrompt, handleInstallClick, navItems, wallet
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      <Routes>
        {/* Public Routes without Shell */}
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<Login setUserRole={setUserRole} showToast={showToast} />} />
        <Route path="/signup" element={<Signup setUserRole={setUserRole} showToast={showToast} />} />

        {/* Protected / Shell Routes */}
        <Route element={<AppShell {...shellProps} />}>
          <Route path="/dashboard" element={
            userRole ? <Dashboard showToast={showToast} userRole={userRole} /> : <Navigate to="/login" replace />
          } />

          <Route path="/verify" element={<VerifyView showToast={showToast} wallet={wallet} contract={contract} />} />

          <Route path="/issue" element={
            userRole ? <IssueView showToast={showToast} wallet={wallet} contract={contract} /> : <Navigate to="/login" replace />
          } />

          <Route path="/revoke" element={
            userRole ? <RevokeView showToast={showToast} wallet={wallet} contract={contract} /> : <Navigate to="/login" replace />
          } />

          <Route path="/deploy" element={
            userRole === 'admin' ? <ContractDeploy showToast={showToast} userRole={userRole} /> : <Navigate to="/login" replace />
          } />
        </Route>
      </Routes>
    </>
  );
}