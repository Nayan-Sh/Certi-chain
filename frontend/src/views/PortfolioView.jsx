import React, { useState, useEffect } from 'react';
import api from '../api';

import { NETWORKS } from '../utils/constants';
import { Shield, ShieldAlert, ShieldCheck, Sparkles, User, BookOpen, Clock, FileText, RefreshCw, XCircle } from 'lucide-react';



import AppLogo from '../components/ui/AppLogo';
import StatusBadge from '../components/ui/StatusBadge';

function PortfolioView({ certId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/api/verify/${certId}`);
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

export default PortfolioView;
