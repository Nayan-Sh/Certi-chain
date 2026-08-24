import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';

function StatusBadge({ status }) {
  const map = {
    VERIFIED: { icon: <CheckCircle2 size={18} />, text: 'VERIFIED — Hash Matches Blockchain Record', type: 'success' },
    TAMPERED: { icon: <XCircle size={18} />, text: 'TAMPERED — File Does Not Match Chain Record', type: 'danger' },
    NOT_FOUND: { icon: <AlertCircle size={18} />, text: 'Certificate ID Not Found on Ledger', type: 'danger' },
    ISSUED: { icon: <CheckCircle2 size={18} />, text: 'SECURELY ISSUED to Blockchain Ledger', type: 'success' },
    AI_REJECTED: { icon: <ShieldAlert size={18} />, text: 'REJECTED — AI Forensic Guard Triggered', type: 'danger' },
    BATCH_ISSUED: { icon: <CheckCircle2 size={18} />, text: 'BATCH ISSUED — Certificates Deployed to Blockchain', type: 'success' },
    BATCH_REJECTED: { icon: <ShieldAlert size={18} />, text: 'BATCH REJECTED — All Certificates Failed AI Check', type: 'danger' },
    BATCH_PARTIAL: { icon: <AlertTriangle size={18} />, text: 'PARTIAL — Some Certificates Rejected by AI', type: 'danger' },
  };
  const m = map[status];
  if (!m) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '14px 18px', borderRadius: '14px', fontWeight: '700', fontSize: '14px', marginBottom: '16px',
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

export default StatusBadge;
