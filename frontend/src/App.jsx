import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import CryptoJS from 'crypto-js';
import { ethers } from 'ethers';
import './index.css';
import {
  ShieldCheck, FileSearch, ShieldAlert, FileUp, CheckCircle2,
  AlertCircle, XCircle, LayoutDashboard, Trash2, RefreshCw,
  ExternalLink, Sparkles, Copy, Hash, Download, Users, Wallet,
  Menu, X, ScanLine, Globe, ChevronRight, Award, Lock, Zap,
  Smartphone, QrCode, Fingerprint, Bell, Moon, Sun, Share2,
  History, TrendingUp, CheckCircle, AlertTriangle, Info,
  Printer, FileText, Medal, Calendar, Building2, User, BookOpen
} from 'lucide-react';

const API = `http://${window.location.hostname}:5000/api/certificates`;

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
      background: 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(10px)',
      border: `1px solid ${colors[type]}`,
      borderRadius: '12px',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      color: colors[type],
      boxShadow: `0 10px 30px rgba(0,0,0,0.5), 0 0 20px ${colors[type]}20`,
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

// ── Wallet Connection Hook ─────────────────────────────────────────────────
function useWallet() {
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = async () => {
    if (!window.ethereum) {
      throw new Error('Please install MetaMask!');
    }
    setIsConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const network = await provider.getNetwork();
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));
      
      // Switch to Sepolia if not already
      if (Number(network.chainId) !== 11155111) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }], // Sepolia
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xaa36a7',
                chainName: 'Sepolia Testnet',
                nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
                blockExplorerUrls: ['https://sepolia.etherscan.io']
              }]
            });
          }
        }
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setAccount('');
    setChainId(null);
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        setAccount(accounts[0] || '');
      });
      window.ethereum.on('chainChanged', (chainId) => {
        setChainId(parseInt(chainId, 16));
      });
    }
  }, []);

  return { account, chainId, isConnecting, connect, disconnect, isConnected: !!account };
}

// ── QR Scanner Component ───────────────────────────────────────────────────
function QRScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const [hasCamera, setHasCamera] = useState(true);

  useEffect(() => {
    let stream = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setHasCamera(false);
      }
    };
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  const handleCapture = () => {
    // Simplified QR detection - in production use jsQR library
    onScan('CERT-' + Date.now());
    onClose();
  };

  if (!hasCamera) {
    return (
      <div className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
        <AlertCircle size={48} color="var(--accent-red)" style={{ marginBottom: '16px' }} />
        <p>Camera access denied. Please enter certificate ID manually.</p>
        <button onClick={onClose} className="btn-3d" style={{ marginTop: '16px' }}>Close</button>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: '16px', position: 'relative' }}>
      <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', zIndex: 10 }}>
        <X size={24} />
      </button>
      <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: '12px' }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '200px', height: '200px', border: '2px dashed var(--accent-cyan)', borderRadius: '12px' }} />
      <button onClick={handleCapture} className="btn-3d" style={{ marginTop: '16px', width: '100%' }}>
        <ScanLine size={18} style={{ marginRight: '8px' }} /> Scan Certificate
      </button>
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────────────
function Skeleton({ width, height }) {
  return (
    <div style={{
      width: width || '100%',
      height: height || '20px',
      background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      borderRadius: '8px'
    }} />
  );
}

// ── Utility ────────────────────────────────────────────────────────────────
const genId = () => `CERT-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;

const truncateAddress = (addr) => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : '';

const copyToClipboard = async (text, showToast) => {
  try {
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!', 'success');
      return;
    }
    
    // Fallback for non-secure contexts (HTTP)
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      showToast('Copied to clipboard!', 'success');
    } else {
      showToast('Failed to copy - please copy manually', 'error');
    }
  } catch (err) {
    showToast('Failed to copy - please copy manually', 'error');
    console.error('Copy failed:', err);
  }
};

async function computeFileHash(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target.result;
      
      // Try native WebCrypto first (requires HTTPS or localhost)
      if (window.crypto && window.crypto.subtle) {
        try {
          const hashBuf = await window.crypto.subtle.digest('SHA-256', buffer);
          const hashHex = Array.from(new Uint8Array(hashBuf))
            .map(b => b.toString(16).padStart(2,'0')).join('');
          return resolve(hashHex);
        } catch (err) {
          console.warn("Native crypto failed, using fallback...");
        }
      }
      
      // Fallback: crypto-js for mobile devices on local network without HTTPS
      const wordBuffer = CryptoJS.lib.WordArray.create(buffer);
      const hashHex = CryptoJS.SHA256(wordBuffer).toString(CryptoJS.enc.Hex);
      resolve(hashHex);
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── AI Report Card ─────────────────────────────────────────────────────────
function AiReportCard({ trust_score, details, ai_safe, ai_message, compact }) {
  if (trust_score === undefined) return null;
  const scoreColor = trust_score >= 70 ? 'var(--accent-green)' : trust_score >= 40 ? '#f59e0b' : 'var(--accent-red)';
  const pct = Math.max(0, Math.min(100, trust_score));

  if (compact) {
    return (
      <div style={{ 
        padding: '12px 16px', 
        background: 'rgba(0,0,0,0.3)', 
        borderRadius: '12px',
        border: `1px solid ${scoreColor}40`,
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{ 
          width: '40px', 
          height: '40px', 
          borderRadius: '50%', 
          background: `conic-gradient(${scoreColor} ${pct * 3.6}deg, rgba(255,255,255,0.1) 0deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: 'bold',
          color: scoreColor
        }}>
          {pct}%
        </div>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>AI Trust Score</div>
          <div style={{ fontSize: '14px', color: ai_safe ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
            {ai_safe ? 'Verified Authentic' : 'Suspicious Document'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ marginTop: '20px', padding: '24px', animation: 'slideUpFade 0.4s ease' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
        <h3 style={{ margin:0, display:'flex', alignItems:'center', gap:'10px', fontSize:'15px', color: ai_safe ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {ai_safe ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
          {ai_safe ? 'AI VERIFIED — Authentic Document' : 'AI FORENSIC DANGER'}
        </h3>
      </div>

      {/* Trust score 3D Glowing Bar */}
      <div style={{ marginBottom:'20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'var(--text-muted)', marginBottom:'8px', fontWeight:600 }}>
          <span>AI Trust Score</span>
          <span style={{ color: scoreColor, fontWeight:800, textShadow: `0 0 10px ${scoreColor}` }}>{pct}%</span>
        </div>
        <div className="progress-track">
          <div 
            className="progress-fill" 
            style={{
              width: `${pct}%`, 
              background: `linear-gradient(90deg, transparent, ${scoreColor})`,
              boxShadow: `0 0 15px ${scoreColor}`
            }}
          />
        </div>
      </div>

      {/* LLM Forensic Report */}
      {!ai_safe && (details?.llm_forensic_report || ai_message) && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '16px', 
          background: 'rgba(168,85,247,0.1)', 
          borderLeft: '4px solid var(--accent-purple)', 
          borderRadius: '8px',
          boxShadow: 'inset 0 0 20px rgba(168,85,247,0.05)'
        }}>
          <h4 style={{ color: 'var(--accent-purple)', margin: '0 0 8px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} /> LLM Forensic Analysis
          </h4>
          <p style={{ margin: 0, color: 'white', fontSize: '13px', lineHeight: 1.5 }}>
            {details?.llm_forensic_report || ai_message}
          </p>
        </div>
      )}

      {/* Detail grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', fontSize:'13px' }}>
        {[
          { label:'Name OCR Match',  val: details?.name_matched },
          { label:'Course OCR Match',val: details?.course_matched },
          { label:'Org OCR Match',   val: details?.org_matched },
          { label:'Image Forensics', val: !details?.tampering_detected },
        ].map(({ label, val }) => (
          <div key={label} style={{
            padding:'10px 14px', borderRadius:'10px',
            background: val ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${val ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
            display:'flex', justifyContent:'space-between', alignItems:'center'
          }}>
            <span style={{ color:'var(--text-muted)' }}>{label}</span>
            <span style={{ filter: 'drop-shadow(0 0 5px currentColor)' }}>{val ? '✅' : '❌'}</span>
          </div>
        ))}
      </div>

      {details?.ocr_notes && (
        <p style={{ margin:'14px 0 0', fontSize:'12px', color:'var(--text-muted)', borderTop:'1px solid var(--glass-border)', paddingTop:'10px' }}>
          📝 {details.ocr_notes}
        </p>
      )}
    </div>
  );
}

// ── Status Badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    VERIFIED:     { icon: <CheckCircle2 size={18}/>, text:'VERIFIED — Hash Matches Blockchain Record', type:'success' },
    TAMPERED:     { icon: <XCircle size={18}/>, text:'TAMPERED — File Does Not Match Chain Record', type:'danger' },
    NOT_FOUND:    { icon: <AlertCircle size={18}/>, text:'Certificate ID Not Found on Ledger', type:'danger' },
    ISSUED:       { icon: <CheckCircle2 size={18}/>, text:'SECURELY ISSUED to Blockchain Ledger', type:'success' },
    AI_REJECTED:  { icon: <ShieldAlert size={18}/>, text:'REJECTED — AI Forensic Guard Triggered', type:'danger' },
  };
  const m = map[status];
  if (!m) return null;
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:'10px',
      padding:'14px 18px', borderRadius:'14px', fontWeight:'700', fontSize:'14px', marginBottom:'16px',
      background: m.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      border: `1px solid ${m.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)'}`,
      color: m.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)',
      boxShadow: `0 4px 15px ${m.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
      animation: 'slideUpFade 0.3s ease'
    }}>
      {m.icon} <span style={{ letterSpacing: '0.02em' }}>{m.text}</span>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ showToast }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/stats`);
      setStats(data);
    } catch {
      setStats(null);
      showToast('Failed to load dashboard data', 'error');
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const cards = stats ? [
    { label:'Total Issued', value: stats.total, icon: Award, color:'var(--accent-blue)', trend: '+12%' },
    { label:'Issued Today', value: stats.issuedToday, icon: TrendingUp, color:'var(--accent-green)', trend: '+5%' },
    { label:'Revoked', value: stats.revoked, icon: ShieldAlert, color:'var(--accent-red)', trend: '-2%' },
    { label:'Avg AI Score', value: `${stats.avgAiScore}%`, icon: Zap, color:'var(--accent-purple)', trend: 'Stable' },
  ] : [];

  return (
    <div className="view-wrapper">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'32px', flexWrap:'wrap', gap:'16px' }}>
        <h1 className="title-glow">
          <LayoutDashboard size={28} color="var(--accent-cyan)"/> 
          <span className="text-gradient">Dashboard</span>
        </h1>
        <div style={{ display:'flex', gap:'8px', background:'rgba(0,0,0,0.3)', padding:'4px', borderRadius:'10px' }}>
          {['24h', '7d', '30d'].map(range => (
            <button
              key={range}
              onClick={() => setSelectedTimeRange(range)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: selectedTimeRange === range ? 'var(--accent-blue)' : 'transparent',
                color: selectedTimeRange === range ? '#000' : 'var(--text-muted)',
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
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'16px' }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="glass-panel" style={{ padding: '24px' }}>
              <Skeleton width="40px" height="40px" />
              <div style={{ marginTop: '16px' }}><Skeleton width="60%" height="32px" /></div>
            </div>
          ))}
        </div>
      ) : !stats ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <AlertCircle size={48} color="var(--accent-red)" style={{ marginBottom: '16px' }} />
          <p style={{ color:'var(--accent-red)' }}>Backend connection failed. Is Hardhat / Node running?</p>
          <button onClick={load} className="btn-3d" style={{ marginTop: '16px' }}>Retry Connection</button>
        </div>
      ) : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'16px', marginBottom:'24px', perspective:'1000px' }}>
            {cards.map((c, i) => (
              <div key={c.label} className="stat-card stagger-item" style={{ animationDelay: `${i * 0.1}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <c.icon size={28} color={c.color} style={{ filter: `drop-shadow(0 4px 8px ${c.color}66)` }} />
                  <span style={{ fontSize: '11px', color: c.trend.startsWith('+') ? 'var(--accent-green)' : c.trend.startsWith('-') ? 'var(--accent-red)' : 'var(--text-muted)', fontWeight: 600 }}>
                    {c.trend}
                  </span>
                </div>
                <div style={{ fontSize:'28px', fontWeight:'800', color: c.color, textShadow: `0 0 20px ${c.color}66` }}>{c.value}</div>
                <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'4px', fontWeight:500, letterSpacing:'0.05em', textTransform:'uppercase' }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div className="stagger-item" style={{ animationDelay: '0.4s', display:'flex', gap:'12px', marginBottom:'32px', justifyContent:'center' }}>
            <button
              onClick={async () => {
                if (!window.confirm("Are you sure you want to delete ALL metadata?")) return;
                try {
                  await axios.delete(`${API}/clear`);
                  load();
                  showToast('Data cleared successfully', 'success');
                } catch (err) { 
                  showToast('Failed to clear data: ' + err.message, 'error'); 
                }
              }}
              className="btn-danger" style={{ flex: 1, padding: '14px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '8px', alignItems:'center', fontSize: '15px', fontWeight:700, boxShadow: '0 8px 16px rgba(239,68,68,0.2)' }}
            >
              <Trash2 size={18}/> Clear All Data
            </button>
            <button onClick={load} className="btn-3d" style={{ 
              flex: 1, padding: '14px 24px', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems:'center', gap: '8px', fontSize: '15px', fontWeight:700 
            }}>
              <RefreshCw size={18}/> Refresh Dashboard
            </button>
          </div>

          {stats.recent?.length > 0 && (
            <div className="stagger-item" style={{ animationDelay: '0.5s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin:0, color:'var(--accent-blue)', fontSize:'12px', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:700 }}>
                  <History size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Live Chain Activity
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{stats.recent.length} recent</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
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
                        <div style={{ fontWeight:'700', fontSize:'14px', color:'white', marginBottom:'2px' }}>{c.studentName}</div>
                        <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>{c.course}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                      <span className="badge-outline" style={{
                        background: c.revoked ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                        color: c.revoked ? 'var(--accent-red)' : 'var(--accent-green)',
                        borderColor: c.revoked ? 'var(--accent-red)' : 'var(--accent-green)'
                      }}>
                        {c.revoked ? 'REVOKED' : 'VALID'}
                      </span>
                      <span style={{ fontSize:'12px', fontWeight:700, color:'var(--accent-purple)' }}>
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
function IssueView({ showToast }) {
  const [mode, setMode] = useState('single'); // 'single' or 'batch'
  const [form, setForm] = useState({ id: genId(), studentName:'', course:'', orgName:'CertifyChain Institute' });
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Batch Mode States
  const [batchFile, setBatchFile] = useState(null);
  const [batchPreview, setBatchPreview] = useState([]);
  
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const isMobile = window.innerWidth <= 768;

  const upd = (k, v) => setForm(f => ({...f, [k]:v}));

  const handleBatchFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setBatchFile(f);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split('\n').filter(r => r.trim());
      const parsed = rows.slice(1).map(row => {
        const [studentName, course] = row.split(',').map(s => s.trim());
        return { 
          id: genId(), 
          studentName: studentName || 'Unknown Student', 
          course: course || 'Certification', 
          orgName: form.orgName 
        };
      }).filter(item => item.studentName && item.course);
      
      setBatchPreview(parsed);
      showToast(`Parsed ${parsed.length} certificates from CSV`, 'success');
    };
    reader.readAsText(f);
  };

  const handleBatchIssue = async () => {
    if (batchPreview.length === 0) {
      showToast('No valid rows found in CSV.', 'warning');
      return;
    }
    setBusy(true); setResult(null);
    try {
      const res = await axios.post(`${API}/batch-issue`, {
        certificates: batchPreview
      });

      if (res.data.success) {
        setResult({
          status: 'ISSUED',
          message: `Successfully batch minted ${res.data.mintedCount} certificates in 1 transaction!`,
          txHash: res.data.txHash,
          isBatch: true,
          mintedCount: res.data.mintedCount
        });
        setBatchFile(null);
        setBatchPreview([]);
        showToast(`Batch issued ${res.data.mintedCount} certificates!`, 'success');
      }
    } catch (err) {
      showToast('Batch Issue Error: ' + (err.response?.data?.error || err.message), 'error');
    } finally { setBusy(false); }
  };

  const handleSingleIssue = async () => {
    if (!file || !form.id) {
      showToast('Upload a file and fill all fields!', 'warning');
      return;
    }
    setBusy(true); setResult(null); setUploadProgress(0);
    try {
      const payload = new FormData();
      payload.append('file', file);
      Object.entries(form).forEach(([k,v]) => payload.append(k, v));

      const res = await axios.post(`${API}/issue`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      if (res.data.success) {
        setResult({
          status: 'ISSUED',
          fileHash: res.data.fileHash,
          txHash: res.data.txHash,
          ipfsHash: res.data.certificate?.ipfsHash,
          trust_score: res.data.aiAnalysis?.trust_score ?? 0,
          details: res.data.aiAnalysis?.details ?? {},
          ai_safe: res.data.aiAnalysis?.is_safe,
          ai_message: res.data.aiAnalysis?.message,
          certId: form.id,
          studentName: form.studentName,
          course: form.course,
          orgName: form.orgName,
          issuedAt: new Date().toISOString(),
        });
        setForm(f => ({...f, id: genId()}));
        setFile(null);
        showToast('Certificate issued successfully!', 'success');
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.error === 'AI_REJECTED') {
        setResult({
          status: 'AI_REJECTED',
          message: errData.message,
          trust_score: errData.aiAnalysis?.trust_score ?? 0,
          details: errData.aiAnalysis?.details ?? {},
          ai_safe: false,
          ai_message: errData.aiAnalysis?.message,
        });
        showToast('Certificate rejected by AI analysis', 'error');
      } else {
        showToast('Error: ' + (errData?.error || err.message), 'error');
      }
    } finally { setBusy(false); setUploadProgress(0); }
  };

  return (
    <div className="view-wrapper">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <h1 className="title-glow text-gradient" style={{ margin: 0 }}>
          <FileUp size={28} color="var(--accent-blue)"/> 
          Deploy to Ledger &amp; AI Guard
        </h1>
        
        {/* Toggle Mode */}
        <div style={{ display:'flex', background:'rgba(0,0,0,0.4)', borderRadius:'12px', padding:'4px', border:'1px solid var(--glass-border)' }}>
            <button onClick={() => { setMode('single'); setResult(null); }} style={{ padding:'8px 16px', borderRadius:'8px', fontSize:'13px', fontWeight:600, border:'none', cursor:'pointer', background: mode === 'single' ? 'var(--accent-blue)' : 'transparent', color: mode === 'single' ? '#000' : 'white', transition:'all 0.2s', display:'flex', alignItems:'center', gap:'6px' }}>
                <FileUp size={14}/> Single
            </button>
            <button onClick={() => { setMode('batch'); setResult(null); }} style={{ padding:'8px 16px', borderRadius:'8px', fontSize:'13px', fontWeight:600, border:'none', cursor:'pointer', background: mode === 'batch' ? 'var(--accent-purple)' : 'transparent', color: mode === 'batch' ? '#000' : 'white', transition:'all 0.2s', display:'flex', alignItems:'center', gap:'6px' }}>
                <Users size={14}/> Enterprise Batch (CSV)
            </button>
        </div>
      </div>

      {mode === 'single' ? (
        <>
          <div style={{ position:'relative' }}>
            <input className="input-3d" value={form.id} placeholder="Unique ID" onChange={e => upd('id', e.target.value)} />
            <button
              onClick={() => upd('id', genId())}
              style={{
                position:'absolute', right:'16px', top:'21px',
                background:'rgba(0,242,254,0.1)', border:'1px solid var(--accent-cyan)', color:'var(--accent-cyan)',
                padding:'6px 12px', borderRadius:'8px', cursor:'pointer', fontSize:'11px', fontWeight:700,
                display:'flex', alignItems:'center', gap:'4px', transition:'all 0.2s'
              }}
              onMouseOver={e=>e.currentTarget.style.transform='scale(1.05)'}
              onMouseOut={e=>e.currentTarget.style.transform='scale(1)'}
            >
              <Sparkles size={12}/> Auto-ID
            </button>
          </div>

          <input className="input-3d" placeholder="Student Name" value={form.studentName} onChange={e => upd('studentName', e.target.value)} />
          <input className="input-3d" placeholder="Course / Credential" value={form.course} onChange={e => upd('course', e.target.value)} />
          <input className="input-3d" placeholder="Issuing Organisation" value={form.orgName} onChange={e => upd('orgName', e.target.value)} />

          <label className={`upload-zone ${file ? 'active' : ''}`} style={{ display:'block' }}>
            <FileUp size={36} color={file ? 'var(--accent-cyan)' : 'var(--text-muted)'} style={{marginBottom:12, filter: file ? 'drop-shadow(0 0 10px var(--accent-cyan))' : 'none', transition:'all 0.3s'}}/>
            <h4 style={{ margin:'0 0 6px', color: file ? 'white' : 'var(--text-muted)', fontSize:'16px' }}>
              {file ? 'File Queue Ready' : 'Drag & Drop Certificate File'}
            </h4>
            <p style={{margin:0, color:'var(--text-muted)', fontSize:'12px', opacity: 0.7}}>
              <strong>Accepted:</strong> PDF, PNG, JPG only. Max 10MB. <br/>
              <span style={{color: 'var(--accent-red)'}}>Note: Only certificate documents will be accepted.</span>
            </p>
            <input 
              type="file" 
              accept=".pdf,.png,.jpg,.jpeg" 
              style={{display:'none'}} 
              onChange={e => {
                const selectedFile = e.target.files[0];
                if (selectedFile) {
                  const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
                  const maxSize = 10 * 1024 * 1024; // 10MB
                  
                  if (!allowedTypes.includes(selectedFile.type)) {
                    showToast('Invalid file type. Only PDF, PNG, JPG files are accepted.', 'error');
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
              <div style={{marginTop:'16px', display:'inline-flex', alignItems: 'center', gap: '8px', padding:'6px 14px', background:'rgba(0,242,254,0.1)', border:'1px solid rgba(0,242,254,0.3)', borderRadius:'99px', color:'var(--accent-cyan)', fontSize:'12px', fontWeight:600}}>
                📄 {file.name}
                <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              </div>
            )}
          </label>

          <button className="btn-3d" onClick={handleSingleIssue} disabled={busy}>
            {busy ? <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'10px'}}><RefreshCw size={18} style={{animation:'spin 1s linear infinite'}}/> <span>AI Analysis &amp; Minting to Blockchain...</span></div> : 'Authenticate & Mint to Blockchain'}
          </button>
        </>
      ) : (
        /* BATCH MODE UI */
        <div style={{ animation: 'slideUpFade 0.4s ease' }}>
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', border: '1px solid rgba(168,85,247,0.3)' }}>
                <h3 style={{ margin:'0 0 12px', color:'var(--accent-purple)', fontSize:'16px', display:'flex', alignItems:'center', gap:'8px' }}>
                   <Users size={18} /> Enterprise Batch CSV Generation
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5, marginBottom: '20px' }}>
                    Upload a CSV file with headers <code>StudentName, Course</code> to systematically generate and mint up to 100 certificates in a single gas-optimized transaction. This bypasses the visual AI check as it is an authorized enterprise action.
                </p>
                <input className="input-3d" placeholder="Confirm Issuing Organisation" value={form.orgName} onChange={e => upd('orgName', e.target.value)} />
                
                <label className={`upload-zone ${batchFile ? 'active' : ''}`} style={{ display:'block', borderColor: 'rgba(168,85,247,0.3)' }}>
                    <h4 style={{ margin:'0 0 6px', color: batchFile ? 'white' : 'var(--text-muted)', fontSize:'16px' }}>
                    {batchFile ? 'CSV Uploaded' : 'Drop CSV Roster File'}
                    </h4>
                    <input type="file" accept=".csv" style={{display:'none'}} onChange={handleBatchFile} />
                    {batchFile && <div style={{marginTop:'16px', display:'inline-block', padding:'6px 14px', background:'rgba(168,85,247,0.1)', borderRadius:'99px', color:'var(--accent-purple)', fontSize:'12px', fontWeight:600}}>📄 {batchFile.name}</div>}
                </label>
            </div>

            {batchPreview.length > 0 && (
                <div style={{ marginBottom: '24px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '16px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Preview: First 3 Rows</span>
                        <span style={{ fontSize: '12px', color: 'var(--accent-purple)', fontWeight: 700 }}>{batchPreview.length} Certificates Ready</span>
                    </div>
                    {batchPreview.slice(0, 3).map((item, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px' }}>
                             <span style={{ color: 'white' }}>{item.studentName}</span>
                             <span style={{ color: 'var(--accent-cyan)' }}>{item.course}</span>
                             <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px' }}>{item.id}</span>
                        </div>
                    ))}
                    {batchPreview.length > 3 && <div style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>...and {batchPreview.length - 3} more</div>}
                </div>
            )}

            <button className="btn-3d" style={{ background: 'linear-gradient(135deg, var(--accent-purple), #d946ef)' }} onClick={handleBatchIssue} disabled={busy || batchPreview.length === 0}>
                {busy ? <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'10px'}}><RefreshCw size={18} style={{animation:'spin 1s linear infinite'}}/> <span>Compiling Block Transaction...</span></div> : 'Execute Batch Mint Phase'}
            </button>
        </div>
      )}

      {result && (
        <div style={{marginTop:'32px', animation:'slideUpFade 0.5s ease'}}>
          {result.isBatch ? (
               <div className="glass-panel" style={{ padding: '24px', borderLeft: '4px solid var(--accent-purple)' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                       <CheckCircle2 size={24} color="var(--accent-purple)" />
                       <h3 style={{ margin: 0, color: 'white' }}>{result.message}</h3>
                   </div>
                   <p style={{ margin:'16px 0 0', fontSize:'13px', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'6px' }}>
                    <Hash size={14} color="var(--accent-purple)"/> Batch Tx Hash: 
                    <code style={{color:'var(--accent-purple)', fontSize:'12px', wordBreak:'break-all'}}>{result.txHash}</code>
                  </p>
               </div>
          ) : (
          <>
          <StatusBadge status={result.status} />

          {result.status === 'AI_REJECTED' && (
            <div style={{ padding:'16px', background:'rgba(239,68,68,0.05)', border:'1px solid var(--accent-red)', borderRadius:'14px', marginBottom:'16px', fontSize:'14px', color:'#fca5a5', lineHeight: 1.5, boxShadow: 'inset 0 0 20px rgba(239,68,68,0.1)' }}>
              <strong>AI Intercept:</strong> The document failed automated checks. See the detailed forensic report below.
            </div>
          )}

          {result.status === 'ISSUED' && result.fileHash && (
            <div className="glass-panel" style={{ 
              padding: isMobile ? '24px' : '32px', 
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
              border: '2px solid var(--accent-green)',
              position: 'relative'
            }}>
              {/* Success Header */}
              <div style={{ 
                textAlign: 'center', 
                marginBottom: '24px',
                paddingBottom: '20px',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: '0 0 30px rgba(16, 185, 129, 0.5)'
                }}>
                  <CheckCircle2 size={32} color="white" />
                </div>
                <h2 style={{ 
                  margin: 0, 
                  fontSize: isMobile ? '22px' : '26px',
                  color: 'var(--accent-green)',
                  fontWeight: 700
                }}>
                  Certificate Successfully Issued
                </h2>
                <p style={{ 
                  margin: '8px 0 0 0', 
                  fontSize: '13px',
                  color: 'var(--text-muted)'
                }}>
                  Secured on Blockchain with AI Verification
                </p>
              </div>

              {/* Certificate Details */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', 
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div style={{
                  padding: '16px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px'
                  }}>
                    Certificate ID
                  </div>
                  <code style={{
                    fontSize: '14px',
                    color: 'var(--accent-purple)',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all'
                  }}>
                    {result.certId}
                  </code>
                </div>

                <div style={{
                  padding: '16px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px'
                  }}>
                    AI Trust Score
                  </div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: result.trust_score >= 70 ? 'var(--accent-green)' : result.trust_score >= 40 ? '#f59e0b' : 'var(--accent-red)'
                  }}>
                    {result.trust_score}%
                  </div>
                </div>

                {/* Certificate Details */}
                <div style={{
                  padding: '16px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px'
                  }}>
                    Recipient Name
                  </div>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'white'
                  }}>
                    {result.studentName}
                  </div>
                </div>

                <div style={{
                  padding: '16px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px'
                  }}>
                    Course / Credential
                  </div>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'white'
                  }}>
                    {result.course}
                  </div>
                </div>

                <div style={{
                  padding: '16px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px'
                  }}>
                    Issuing Organization
                  </div>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'white'
                  }}>
                    {result.orgName}
                  </div>
                </div>

                <div style={{
                  padding: '16px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  gridColumn: isMobile ? '1' : '1 / -1'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}>
                    <span style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Immutable File Hash (SHA-256)
                    </span>
                    <button 
                      onClick={() => copyToClipboard(result.fileHash, showToast)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <code style={{
                    fontSize: '12px',
                    color: 'var(--accent-cyan)',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all'
                  }}>
                    {result.fileHash}
                  </code>
                </div>
              </div>

              {/* Transaction Details */}
              {result.txHash && (
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
                    marginBottom: '12px'
                  }}>
                    <span style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Blockchain Transaction
                    </span>
                    <button 
                      onClick={() => copyToClipboard(result.txHash, showToast)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <code style={{
                    fontSize: '12px',
                    color: 'var(--accent-purple)',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    display: 'block',
                    marginBottom: '12px'
                  }}>
                    {result.txHash}
                  </code>
                  <a 
                    href={`https://sepolia.etherscan.io/tx/${result.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      color: 'var(--accent-cyan)',
                      textDecoration: 'none'
                    }}
                  >
                    <ExternalLink size={12} /> View on Sepolia Etherscan
                  </a>
                </div>
              )}

              {/* QR Code for Certificate */}
              <div style={{
                textAlign: 'center',
                padding: '24px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '16px',
                border: '1px dashed rgba(255,255,255,0.1)'
              }}>
                <p style={{
                  margin: '0 0 16px 0',
                  fontSize: '13px',
                  color: 'var(--text-muted)'
                }}>
                  <QrCode size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  Scan to Verify Certificate
                </p>
                <div style={{
                  display: 'inline-block',
                  padding: '16px',
                  background: 'white',
                  borderRadius: '12px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
                }}>
                  <QRCodeSVG 
                    value={`${window.location.protocol}//${window.location.host}/?verify=${result.certId}`} 
                    size={isMobile ? 140 : 160} 
                  />
                </div>
                <p style={{
                  margin: '12px 0 0 0',
                  fontSize: '11px',
                  color: 'var(--text-muted)'
                }}>
                  {window.location.protocol}//{window.location.host}/?verify={result.certId}
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px',
                flexWrap: 'wrap'
              }}>
                <button 
                  onClick={() => window.print()}
                  className="btn-3d"
                  style={{ 
                    flex: 1,
                    minWidth: '140px',
                    padding: '14px 24px',
                    fontSize: '14px',
                    background: 'transparent',
                    border: '1px solid var(--accent-cyan)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Printer size={18} /> Print Receipt
                </button>
                <button 
                  onClick={() => copyToClipboard(`${window.location.origin}/?verify=${result.certId}`, showToast)}
                  className="btn-3d"
                  style={{ 
                    flex: 1,
                    minWidth: '140px',
                    padding: '14px 24px',
                    fontSize: '14px',
                    background: 'transparent',
                    border: '1px solid var(--accent-purple)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Share2 size={18} /> Share Link
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
                      padding: '14px 24px',
                      fontSize: '14px',
                      background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      textDecoration: 'none',
                      color: '#020617'
                    }}
                  >
                    <ExternalLink size={18} /> View on IPFS
                  </a>
                )}
                <button 
                  onClick={() => {
                    setResult(null);
                    setForm({ id: genId(), studentName: '', course: '', orgName: form.orgName });
                    setFile(null);
                  }}
                  className="btn-3d"
                  style={{ 
                    flex: 1,
                    minWidth: '140px',
                    padding: '14px 24px',
                    fontSize: '14px',
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <FileUp size={18} /> Issue Another
                </button>
              </div>

              {/* Printable Receipt Section - Hidden on screen, visible when printing */}
              <div className="printable-receipt" style={{ 
                display: 'none',
                '@media print': { display: 'block !important' }
              }}>
                <div style={{
                  padding: '40px',
                  background: 'white',
                  color: 'black',
                  fontFamily: 'Arial, sans-serif',
                  maxWidth: '600px',
                  margin: '0 auto'
                }}>
                  <div style={{ textAlign: 'center', marginBottom: '30px', borderBottom: '2px solid #333', paddingBottom: '20px' }}>
                    <h1 style={{ margin: '0 0 10px 0', fontSize: '28px', color: '#333' }}>CertifyChain</h1>
                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Blockchain Certificate Verification System</p>
                  </div>
                  
                  <h2 style={{ textAlign: 'center', marginBottom: '30px', color: '#10b981' }}>CERTIFICATE ISSUANCE RECEIPT</h2>
                  
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '12px 0', fontWeight: 'bold', width: '40%' }}>Certificate ID:</td>
                        <td style={{ padding: '12px 0', fontFamily: 'monospace' }}>{result.certId}</td>
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
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '12px 0', fontWeight: 'bold' }}>Issue Date:</td>
                        <td style={{ padding: '12px 0' }}>{new Date(result.issuedAt).toLocaleString()}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '12px 0', fontWeight: 'bold' }}>AI Trust Score:</td>
                        <td style={{ padding: '12px 0' }}>{result.trust_score}%</td>
                      </tr>
                    </tbody>
                  </table>

                  <div style={{ marginBottom: '20px' }}>
                    <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '12px', color: '#666' }}>BLOCKCHAIN TRANSACTION HASH:</p>
                    <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                      {result.txHash}
                    </p>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '12px', color: '#666' }}>FILE HASH (SHA-256):</p>
                    <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                      {result.fileHash}
                    </p>
                  </div>

                  <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #ddd', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#666' }}>Verify this certificate at:</p>
                    <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', color: '#333' }}>
                      {window.location.origin}/?verify={result.certId}
                    </p>
                  </div>

                  <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '11px', color: '#999' }}>
                    <p>This receipt was generated automatically by CertifyChain.</p>
                    <p>Blockchain-secured certificate verification system.</p>
                  </div>
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
function VerifyView({ showToast }) {
  const [certId, setCertId] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [verificationHistory, setVerificationHistory] = useState(() => {
    const saved = localStorage.getItem('verificationHistory');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Wallet & Web3 State
  const [walletAddress, setWalletAddress] = useState('');
  const [isMintingSBT, setIsMintingSBT] = useState(false);
  const [sbtSuccessHash, setSbtSuccessHash] = useState('');
  const isMobile = window.innerWidth <= 768;

  const connectWallet = async () => {
    if (!window.ethereum) {
      showToast('Please install MetaMask or a Web3 wallet!', 'error');
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setWalletAddress(accounts[0]);
      showToast('Wallet connected!', 'success');
    } catch (err) {
      showToast("Failed to connect wallet: " + err.message, 'error');
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
    
    setIsMintingSBT(true);
    setSbtSuccessHash('');
    
    try {
      const res = await axios.post(`${API}/claim-sbt`, {
          studentAddress: walletAddress,
          certId: certificateId,
          ipfsHash: result.ipfsHash
      });
      
      if(res.data.success) {
          setSbtSuccessHash(res.data.txHash);
          showToast('Soulbound NFT minted successfully!', 'success');
      }
    } catch (err) {
      showToast("NFT Claim Failed: " + (err.response?.data?.error || err.message), 'error');
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
      const res = await axios.get(`${API}/verify/${cleanId}`, { params: fileHash ? { fileHash } : {} });
      const newResult = {
        status: res.data.hashMatch === true ? 'VERIFIED' : res.data.hashMatch === false ? 'TAMPERED' : 'FOUND_NO_FILE',
        ...res.data,
        computedHash: fileHash,
      };
      setResult(newResult);
      
      // Save to history
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
        setResult({ status:'NOT_FOUND', error:'Certificate ID not found on blockchain.' });
        showToast('Certificate not found', 'error');
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
        <FileSearch size={28} color="var(--accent-purple)"/> 
        Cryptographic Verification
      </h1>
      <p style={{ color:'var(--text-muted)', marginBottom:'24px', lineHeight: 1.6 }}>
        Enter an ID to look up blockchain metadata. Optional: Drop the PDF to verify its exact cryptographic hash matches the immutable ledger.
      </p>

      {/* QR Scanner for Mobile */}
      {showQRScanner && (
        <div style={{ marginBottom: '20px' }}>
          <QRScanner onScan={setCertId} onClose={() => setShowQRScanner(false)} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <input 
          className="input-3d" 
          placeholder="Certificate ID (e.g., CERT-XXX)" 
          value={certId} 
          onChange={e => setCertId(e.target.value)}
          style={{ flex: 1, marginBottom: 0 }}
        />
        {isMobile && (
          <button 
            onClick={() => setShowQRScanner(!showQRScanner)}
            className="btn-3d"
            style={{ width: 'auto', padding: '14px', background: 'var(--glass-bg)', border: '1px solid var(--accent-cyan)' }}
          >
            <ScanLine size={20} color="var(--accent-cyan)" />
          </button>
        )}
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

      <label className={`upload-zone ${file ? 'active' : ''}`} style={{ display:'block' }}>
        <FileUp size={32} color={file ? 'var(--accent-purple)' : 'var(--text-muted)'} style={{marginBottom:10, transition:'all 0.3s'}}/>
        <h4 style={{ margin:'0 0 6px', color: file ? 'white' : 'var(--text-muted)', fontSize:'15px' }}>
          {file ? 'File Ready for Hash Check' : 'Drop File to verify exact contents (Optional)'}
        </h4>
        <p style={{margin:0, color:'var(--text-muted)', fontSize:'11px', opacity: 0.7}}>
          PDF, PNG, JPG only. Max 10MB.
        </p>
        <input 
          type="file" 
          accept=".pdf,.png,.jpg,.jpeg" 
          style={{display:'none'}} 
          onChange={e => {
            const selectedFile = e.target.files[0];
            if (selectedFile) {
              const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
              const maxSize = 10 * 1024 * 1024; // 10MB
              
              if (!allowedTypes.includes(selectedFile.type)) {
                showToast('Invalid file type. Only PDF, PNG, JPG files are accepted.', 'error');
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
          <div style={{marginTop:'12px', display:'inline-flex', alignItems: 'center', gap: '8px', padding:'6px 14px', background:'rgba(168,85,247,0.1)', border:'1px solid rgba(168,85,247,0.3)', borderRadius:'99px', color:'var(--accent-purple)', fontSize:'12px', fontWeight:600}}>
            📄 {file.name}
            <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}
      </label>

      <button className="btn-3d" style={{ background: 'linear-gradient(135deg, var(--accent-purple), #d946ef)' }} onClick={handleVerify} disabled={busy}>
        {busy ? <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'10px'}}><RefreshCw size={18} style={{animation:'spin 1s linear infinite'}}/> <span>Querying Ledger...</span></div> : <><Fingerprint size={18} style={{marginRight: '8px'}} /> Verify Authenticity</>}
      </button>

      {result && (
        <div style={{marginTop:'32px', animation:'slideUpFade 0.5s ease'}}>
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
                      color: 'white'
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
                      color: 'white'
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
                      color: 'white'
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
                    onClick={() => window.print()}
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
                    <ShieldAlert size={24}/> 
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
                    <div style={{ marginTop:'24px', paddingTop:'24px', borderTop:'1px solid rgba(168,85,247,0.3)' }}>
                        <h4 style={{ margin: '0 0 16px', fontSize: '14px', color:'var(--accent-purple)', display:'flex', alignItems:'center', gap:'8px' }}>
                           <Wallet size={18}/> Web3 Digital Wallet Integration
                        </h4>
                        
                        {!walletAddress ? (
                            <button onClick={connectWallet} className="btn-3d" style={{ width: '100%', background:'transparent', border:'1px solid var(--accent-purple)', color:'white', padding:'14px 24px', fontSize:'14px' }}>
                                <Globe size={16} style={{marginRight: '8px'}} /> Connect MetaMask to Claim NFT
                            </button>
                        ) : (
                            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                                <div style={{ fontSize:'13px', color:'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-green)' }} />
                                  Connected: <code style={{color:'var(--accent-cyan)'}}>{truncateAddress(walletAddress)}</code>
                                </div>
                                
                                {sbtSuccessHash ? (
                                    <div style={{ padding:'16px', background:'rgba(16,185,129,0.15)', border:'2px solid var(--accent-green)', borderRadius:'12px', color:'white', fontSize:'14px' }}>
                                        <CheckCircle2 color="var(--accent-green)" size={20} style={{marginBottom:'8px', display:'block'}}/>
                                        <strong>Soulbound NFT Claimed Successfully!</strong><br/>
                                        <span style={{ fontSize: '12px', opacity: 0.8 }}>Tx: {sbtSuccessHash.slice(0,20)}...</span>
                                    </div>
                                ) : (
                                    <button onClick={claimAsNFT} disabled={isMintingSBT} className="btn-3d" style={{ background:'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))', padding:'14px 24px', fontSize:'14px', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}>
                                        {isMintingSBT ? <RefreshCw size={18} style={{animation:'spin 1s linear infinite'}}/> : <Medal size={18}/>}
                                        {isMintingSBT ? 'Minting Soulbound NFT...' : 'Claim as Soulbound NFT'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {result.status === 'FOUND_NO_FILE' && (
                  <div style={{ padding:'16px', borderRadius:'12px', background:'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color:'#fbbf24', fontSize:'14px', display:'flex', alignItems:'center', gap:'12px', marginTop:'20px' }}>
                    <AlertCircle size={20}/> 
                    <div>
                      <strong>Metadata Verified</strong><br/>
                      <span style={{ fontSize: '12px', opacity: 0.8 }}>Blockchain record confirmed, but file integrity was not checked. Upload the certificate file for complete verification.</span>
                    </div>
                  </div>
                )}
                
                {result.txHash && (
                  <div style={{ marginTop:'20px', padding:'16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{color:'var(--text-muted)', fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.05em'}}>Blockchain Transaction Hash</span>
                      <button onClick={() => copyToClipboard(result.txHash, showToast)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <Copy size={16} />
                      </button>
                    </div>
                    <code style={{color:'var(--accent-purple)', fontSize:'13px', wordBreak:'break-all', fontFamily: 'monospace'}}>{result.txHash}</code>
                    <a 
                      href={`https://sepolia.etherscan.io/tx/${result.txHash}`}
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
                      <ExternalLink size={12} /> View on Sepolia Etherscan
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
              <div className="glass-panel" style={{ padding:'30px', textAlign:'center', transformStyle: 'preserve-3d', animation: 'float 6s ease-in-out infinite' }}>
                <p style={{ margin:'0 0 20px', color:'white', fontSize:'14px', fontWeight:600 }}>
                  <QrCode size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                  Scan to Open Digital Portfolio View
                </p>
                <div style={{ display:'inline-block', padding:'16px', background:'white', borderRadius:'16px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
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
              <div className="printable-receipt" style={{ 
                display: 'none',
                '@media print': { display: 'block !important' }
              }}>
                <div style={{
                  padding: '40px',
                  background: 'white',
                  color: 'black',
                  fontFamily: 'Arial, sans-serif',
                  maxWidth: '600px',
                  margin: '0 auto'
                }}>
                  <div style={{ textAlign: 'center', marginBottom: '30px', borderBottom: '2px solid #333', paddingBottom: '20px' }}>
                    <h1 style={{ margin: '0 0 10px 0', fontSize: '28px', color: '#333' }}>CertifyChain</h1>
                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Blockchain Certificate Verification System</p>
                  </div>
                  
                  <h2 style={{ textAlign: 'center', marginBottom: '30px', color: result.revoked ? '#ef4444' : '#10b981' }}>
                    {result.revoked ? 'CERTIFICATE REVOKED' : 'CERTIFICATE VERIFIED'}
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
                        <tr style={{ borderBottom: '1px solid #ddd' }}>
                          <td style={{ padding: '12px 0', fontWeight: 'bold' }}>Issue Date:</td>
                          <td style={{ padding: '12px 0' }}>{new Date(result.issuedAt).toLocaleString()}</td>
                        </tr>
                      )}
                      <tr style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '12px 0', fontWeight: 'bold' }}>Status:</td>
                        <td style={{ padding: '12px 0', color: result.revoked ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
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
                    <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#666' }}>Verify this certificate at:</p>
                    <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', color: '#333' }}>
                      {window.location.origin}/?verify={result.id || certId}
                    </p>
                  </div>

                  <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '11px', color: '#999' }}>
                    <p>This certificate was verified on {new Date().toLocaleString()}.</p>
                    <p>Blockchain-secured certificate verification system.</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {result.status === 'TAMPERED' && (
            <div className="glass-panel" style={{ padding:'24px', background:'rgba(239,68,68,0.05)', border:'1px solid var(--accent-red)' }}>
              <p style={{color:'var(--accent-red)', fontSize:'16px', fontWeight:'700', marginBottom:'16px'}}>
                <ShieldAlert size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                The uploaded file does NOT match the cryptographic signature on the blockchain. The file has been altered.
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <div>
                  <span style={{color:'var(--text-muted)', fontSize:'12px', textTransform:'uppercase', letterSpacing:'0.05em'}}>On-Chain Root Hash (Authentic):</span>
                  <code style={{color:'var(--accent-green)', wordBreak:'break-all', fontSize:'12px', display:'block', padding:'8px', background:'rgba(0,0,0,0.5)', borderRadius:'8px', marginTop:'4px'}}>{result.storedFileHash}</code>
                </div>
                <div>
                  <span style={{color:'var(--text-muted)', fontSize:'12px', textTransform:'uppercase', letterSpacing:'0.05em'}}>Your File Hash (Altered):</span>
                  <code style={{color:'var(--accent-red)', wordBreak:'break-all', fontSize:'12px', display:'block', padding:'8px', background:'rgba(0,0,0,0.5)', borderRadius:'8px', marginTop:'4px'}}>{result.computedHash}</code>
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
function RevokeView({ showToast }) {
  const [certId, setCertId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const isMobile = window.innerWidth <= 768;

  const handleRevoke = async () => {
    if (!certId) {
      showToast('Enter a Certificate ID!', 'warning');
      return;
    }
    const confirmed = window.confirm(`DANGER! Are you sure you want to PERMANENTLY REVOKE certificate:\n\n${certId}`);
    if (!confirmed) return;
    setBusy(true); setResult(null);
    try {
      const res = await axios.post(`${API}/revoke`, { id: certId });
      setResult({ success: true, id: res.data.id });
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
        <Trash2 size={28} color="var(--accent-red)"/> 
        Revocation Control
      </h1>
      <p style={{ color:'var(--text-muted)', fontSize:'14px', marginBottom:'32px', lineHeight: 1.6 }}>
        Revoke a certificate to permanently flag it as invalid on the ledger. Anyone verifying this ID will immediately see a red revoked warning.
      </p>

      <div className="glass-panel" style={{ padding:'32px', border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.02)' }}>
        <p style={{ margin:'0 0 16px', fontSize:'14px', color:'var(--accent-red)', display:'flex', alignItems:'center', gap:'8px', fontWeight:700 }}>
          <AlertCircle size={18}/> This action is irreversible.
        </p>
        <input className="input-3d" placeholder="Enter Certificate ID to revoke" style={{ borderColor:'rgba(239,68,68,0.3)', marginBottom:'20px' }} value={certId} onChange={e => setCertId(e.target.value)} />
        <button className="btn-danger btn-3d" onClick={handleRevoke} disabled={busy}>
          {busy ? 'Committing Revocation…' : 'Execute Blockchain Revocation'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop:'24px', animation:'slideUpFade 0.4s ease' }}>
          {result.success
            ? <div className="glass-panel" style={{ padding:'20px', borderLeft:'4px solid var(--accent-green)', display:'flex', alignItems:'center', gap:'12px', color:'white' }}>
                <CheckCircle2 color="var(--accent-green)"/> <div>Certificate <code style={{color:'var(--accent-cyan)'}}>{result.id}</code> has been revoked permanently.</div>
              </div>
            : <div className="glass-panel" style={{ padding:'20px', borderLeft:'4px solid var(--accent-red)', display:'flex', alignItems:'center', gap:'12px', color:'white' }}>
                <XCircle color="var(--accent-red)"/> <div>Revocation failed: {result.error}</div>
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
        const res = await axios.get(`${API}/verify/${certId}`);
        setResult({
          status: res.data.hashMatch === true ? 'VERIFIED' : res.data.hashMatch === false ? 'TAMPERED' : 'FOUND_NO_FILE',
          ...res.data,
        });
      } catch (err) {
        if (err.response?.status === 404) {
          setResult({ status:'NOT_FOUND', error:'Certificate not found.' });
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
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--accent-cyan)' }}>
        <RefreshCw size={40} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (result?.error || result?.status === 'NOT_FOUND') {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px' }}>
        <div className="glass-panel" style={{ padding:'32px', textAlign:'center', border:'1px solid var(--accent-red)' }}>
          <XCircle size={60} color="var(--accent-red)" style={{ margin:'0 auto 16px' }} />
          <h2 style={{ color:'white', marginBottom:'8px' }}>Invalid Certificate</h2>
          <p style={{ color:'var(--text-muted)' }}>This certificate ID could not be found on the blockchain ledger.</p>
        </div>
      </div>
    );
  }

  // Display Mobile-friendly Valid Certificate
  return (
    <div style={{ minHeight:'100vh', padding:'16px', display:'flex', flexDirection:'column', alignItems:'center' }}>
      <div className="glass-panel" style={{ width:'100%', maxWidth:'480px', padding:'32px 24px', textAlign:'center', animation:'slideUpFade 0.6s ease', position:'relative', overflow:'hidden' }}>
        
        {/* Glow behind */}
        <div style={{ position:'absolute', top: 0, left:'50%', transform:'translateX(-50%)', width:'150px', height:'150px', background: result.revoked ? 'var(--accent-red)' : 'var(--accent-green)', filter:'blur(80px)', opacity: 0.2, zIndex: -1 }} />

        {result.revoked ? (
          <ShieldAlert size={64} color="var(--accent-red)" style={{ margin:'0 auto 20px', filter:'drop-shadow(0 0 20px rgba(239,68,68,0.5))' }} />
        ) : (
          <ShieldCheck size={64} color="var(--accent-green)" style={{ margin:'0 auto 20px', filter:'drop-shadow(0 0 20px rgba(16,185,129,0.5))' }} />
        )}
        
        <h1 style={{ fontSize:'24px', color:'white', margin:'0 0 8px', letterSpacing:'-0.03em' }}>
          {result.revoked ? 'Certificate Revoked' : 'Verified Authentic'}
        </h1>
        <p style={{ color: result.revoked ? 'var(--accent-red)' : 'var(--accent-green)', fontSize:'13px', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:700, margin:'0 0 32px' }}>
          Blockchain Secured Record
        </p>

        <div style={{ textAlign:'left', background:'rgba(0,0,0,0.4)', borderRadius:'16px', padding:'20px', border:'1px solid var(--glass-border)', display:'flex', flexDirection:'column', gap:'16px' }}>
          <div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'4px' }}>Recipient</div>
            <div style={{ fontSize:'18px', fontWeight:700, color:'white' }}>{result.studentName}</div>
          </div>
          <div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'4px' }}>Credential</div>
            <div style={{ fontSize:'16px', fontWeight:600, color:'var(--accent-cyan)' }}>{result.course}</div>
          </div>
          <div>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'4px' }}>Issuer</div>
            <div style={{ fontSize:'15px', color:'white' }}>{result.orgName}</div>
          </div>
          {result.issuedAt && (
             <div>
               <div style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'4px' }}>Date Minted</div>
               <div style={{ fontSize:'15px', color:'var(--text-muted)' }}>{new Date(result.issuedAt).toLocaleDateString()}</div>
             </div>
          )}
        </div>

        {result.txHash && (
          <div style={{ marginTop:'24px' }}>
            <div style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'8px' }}>Blockchain Transaction Hash</div>
            <code style={{ fontSize:'11px', color:'var(--accent-purple)', wordBreak:'break-all', display:'block', background:'rgba(168,85,247,0.1)', padding:'12px', borderRadius:'10px', border:'1px solid rgba(168,85,247,0.2)' }}>
              {result.txHash}
            </code>
          </div>
        )}

      </div>
    </div>
  );
}

// ── App Shell ──────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('dashboard');
  const [portfolioId] = useState(() => new URLSearchParams(window.location.search).get('verify'));
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const { toast, showToast, hideToast } = useToast();
  const wallet = useWallet();
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
    return <PortfolioView certId={portfolioId} />;
  }

  const navItems = [
    { key:'dashboard', label:'Dashboard', icon: LayoutDashboard, badge: null },
    { key:'verify', label:'Verify', icon: FileSearch, badge: null },
    { key:'issue', label:'Issue Cert', icon: FileUp, badge: null },
    { key:'revoke', label:'Revoke', icon: Trash2, badge: null },
  ];

  return (
    <div className="app-container">
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
      
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      
      {/* Mobile Header */}
      {isMobile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '60px',
          background: 'rgba(2, 6, 23, 0.95)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 1000
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background:'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', padding:'8px', borderRadius:'10px' }}>
              <ShieldCheck size={20} color="#020617"/>
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
                  color: '#000',
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
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} style={{ background: 'none', border: 'none', color: 'white' }}>
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
          background: 'rgba(2, 6, 23, 0.98)',
          zIndex: 999,
          padding: '20px',
          animation: 'slideUpFade 0.3s ease'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {navItems.map(n => (
              <button 
                key={n.key} 
                onClick={() => { setView(n.key); setIsMobileMenuOpen(false); }}
                style={{
                  padding: '16px 20px',
                  background: view === n.key ? 'rgba(0,242,254,0.1)' : 'transparent',
                  border: view === n.key ? '1px solid var(--accent-cyan)' : '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  color: view === n.key ? 'var(--accent-cyan)' : 'white',
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
          </div>
        </div>
      )}
      
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className="sidebar">
          <div style={{ display:'flex', alignItems:'center', gap:'14px', marginBottom:'40px', padding:'10px 8px', perspective:'500px' }}>
            <div style={{ background:'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', padding:'10px', borderRadius:'14px', boxShadow:'0 10px 20px rgba(0,242,254,0.3)', transform:'translateZ(10px)' }}>
              <ShieldCheck size={28} color="#020617"/>
            </div>
            <div>
              <div style={{ fontWeight:'800', fontSize:'18px', letterSpacing:'-0.02em', color:'white', textShadow:'0 0 10px rgba(255,255,255,0.2)' }}>CertifyChain</div>
              <div style={{ fontSize:'10px', color:'var(--accent-cyan)', marginTop:'2px', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' }}>Defense Matrix Activated</div>
            </div>
          </div>
          
          <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginTop: '24px' }}>
            {navItems.map(n => (
              <button key={n.key} onClick={() => setView(n.key)} className={`nav-item ${view === n.key ? 'active' : ''}`}>
                <span style={{ opacity: view === n.key ? 1 : 0.6, display:'flex', alignItems:'center' }}><n.icon size={18}/></span>
                <span style={{ marginLeft:'12px', letterSpacing:'0.03em' }}>{n.label}</span>
                {n.badge && <span style={{ marginLeft: 'auto', background: 'var(--accent-red)', padding: '2px 8px', borderRadius: '10px', fontSize: '10px' }}>{n.badge}</span>}
              </button>
            ))}
            {deferredPrompt && (
              <button onClick={handleInstallClick} className="nav-item" style={{ marginTop:'16px', background:'var(--glass-bg)', border:'1px solid var(--accent-purple)', color:'var(--accent-purple)' }}>
                <span style={{ display:'flex', alignItems:'center' }}><Download size={18}/></span>
                <span style={{ marginLeft:'12px', letterSpacing:'0.03em', fontWeight:700 }}>Install App</span>
              </button>
            )}
          </div>
          
          <div style={{ marginTop:'auto', padding:'20px', background:'rgba(0,0,0,0.3)', borderRadius:'16px', border:'1px solid var(--glass-border)' }}>
            <h4 style={{ margin:'0 0 10px', color:'var(--text-muted)', fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.1em' }}>System Status</h4>
            <div style={{ fontSize:'11px', color:'white', display:'flex', flexDirection:'column', gap:'8px', fontWeight:500 }}>
              <div style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:6,height:6,borderRadius:3,background:'var(--accent-green)',boxShadow:'0 0 5px var(--accent-green)'}}/> Blockchain Node</div>
              <div style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:6,height:6,borderRadius:3,background:'var(--accent-green)',boxShadow:'0 0 5px var(--accent-green)'}}/> IPFS Storage</div>
              <div style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:6,height:6,borderRadius:3,background:'var(--accent-purple)',boxShadow:'0 0 5px var(--accent-purple)'}}/> AI Neural Net</div>
            </div>
          </div>
        </aside>
      )}

      <main className="main-content" style={{ marginTop: isMobile ? '60px' : 0 }}>
        <div className="glass-panel" style={{ margin:'0 auto', width:'100%', maxWidth:'840px', padding: isMobile ? '20px' : '48px', minHeight: isMobile ? 'calc(100vh - 80px)' : '600px' }}>
          {view === 'dashboard' && <Dashboard showToast={showToast} />}
          {view === 'verify' && <VerifyView showToast={showToast} />}
          {view === 'issue' && <IssueView showToast={showToast} />}
          {view === 'revoke' && <RevokeView showToast={showToast} />}
        </div>
      </main>
    </div>
  );
}