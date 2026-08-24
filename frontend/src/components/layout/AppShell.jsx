import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Award, Search, ShieldAlert, LogOut, Menu, X, Bell } from 'lucide-react';
import AppLogo from '../ui/AppLogo';

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

export default AppShell;
