import React, { useState, useEffect, useCallback } from 'react';
import { Award, Zap, ShieldAlert, TrendingUp, LayoutDashboard, History, RefreshCw, FileSearch, CheckCircle2, XCircle, CheckCircle, AlertCircle, Trash2, BookOpen, Building2, GraduationCap, BarChart2 } from 'lucide-react';

import api from '../api';
import Skeleton from '../components/ui/Skeleton';
import ConfirmationDialog from '../components/ui/ConfirmationDialog';

function Dashboard({ showToast, userRole }) {

  const [stats, setStats] = useState(null);

  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (userRole === 'student') {
        const statsRes = await api.get('/api/certificates/student-stats');

        setStats(statsRes.data || null);
      } else {
        const { data } = await api.get('/api/certificates/admin-stats');
        setStats(data || null);
      }
    } catch (err) {
      console.error(err);
      if (userRole !== 'student') setStats(null);
      showToast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, userRole]);

  useEffect(() => { load(); }, [load]);

  const handleClearData = async () => {
    try {
      await api.delete('/api/clear');
      load();
      showToast('Data cleared successfully', 'success');
    } catch (err) {
      showToast('Failed to clear data: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const cards = stats ? [
    { label: 'Total Issued', value: stats.total, icon: Award, color: 'var(--accent-blue)', trend: '+12%' },
    { label: 'Issued Today', value: stats.issuedToday, icon: TrendingUp, color: 'var(--accent-green)', trend: '+5%' },
    { label: 'Revoked', value: stats.revoked, icon: ShieldAlert, color: 'var(--accent-red)', trend: '-2%' },
    { label: 'Avg AI Score', value: `${stats.avgAiScore || 0}%`, icon: Zap, color: 'var(--accent-purple)', trend: 'Stable' },
  ] : [];

  if (userRole === 'student') {
    // Student stat cards
    const studentCards = stats ? [
      { label: 'Total Certificates', value: stats.total, icon: Award, color: 'var(--accent-purple)', trend: stats.courses > 0 ? `${stats.courses} courses` : '—' },
      { label: 'Courses', value: stats.courses || 0, icon: BookOpen, color: 'var(--accent-blue)', trend: stats.institutions > 0 ? `${stats.institutions} institutions` : '—' },
      { label: 'Avg AI Score', value: `${stats.avgAiScore || 0}%`, icon: Zap, color: 'var(--accent-cyan)', trend: 'Trust Score' },
      { label: 'Revoked', value: stats.revoked || 0, icon: ShieldAlert, color: 'var(--accent-red)', trend: stats.revoked > 0 ? 'Check status' : 'Clean' },
    ] : [];

    return (
      <div className="view-wrapper">
        <h1 className="title-glow" style={{ marginBottom: '8px' }}>
          <LayoutDashboard size={28} color="var(--accent-purple)" />
          <span className="text-gradient">Student Dashboard</span>
        </h1>
        <div style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '14px' }}>
          Home &gt; Student Dashboard
        </div>

        {/* Student Stat Widgets */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px', perspective: '1000px' }}>
            {studentCards.map((c, i) => (
              <div key={c.label} className="stat-card stagger-item" style={{ animationDelay: `${i * 0.1}s`, padding: '24px', borderRadius: '16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ padding: '10px', borderRadius: '12px', background: `${c.color}20` }}>
                    <c.icon size={24} color={c.color} style={{ filter: `drop-shadow(0 2px 4px ${c.color}66)` }} />
                  </div>
                  <span style={{ fontSize: '13px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px', color: 'var(--text-muted)', fontWeight: 700 }}>
                    {c.trend}
                  </span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-main)', marginBottom: '4px' }}>{c.value}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.02em' }}>{c.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <History size={20} color="var(--accent-cyan)" /> Your Certificates
            </h3>
            <button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw className="spin" size={24} style={{ marginBottom: '12px', color: 'var(--accent-blue)' }} />
              <p>Loading your certificates...</p>
            </div>
          ) : stats?.recent?.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
              <FileSearch size={40} style={{ opacity: 0.3, margin: '0 auto 16px', color: 'var(--text-muted)' }} />
              <p style={{ fontSize: '15px', marginBottom: '16px' }}>You don't have any certificates yet.</p>
              <p style={{ fontSize: '13px', marginBottom: '24px', opacity: 0.7 }}>Certificates issued to you by institutions will appear here automatically.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <tr>
                    <th style={{ padding: '16px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)' }}>Certificate ID</th>
                    <th style={{ padding: '16px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)' }}>Course</th>
                    <th style={{ padding: '16px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)' }}>Institution</th>
                    <th style={{ padding: '16px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)' }}>AI Score</th>
                    <th style={{ padding: '16px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)' }}>Status</th>
                    <th style={{ padding: '16px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)' }}>SBT Claim</th>
                    <th style={{ padding: '16px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)' }}>Issued Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((c, idx) => (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--glass-border)', transition: 'background 0.2s', animationDelay: `${idx * 0.05}s` }} className="fade-in" onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '16px' }}>
                        <code style={{
                          fontSize: '13px', color: 'var(--accent-purple)', fontFamily: 'monospace',
                          background: 'rgba(79,70,229,0.1)', border: '1px solid rgba(79,70,229,0.2)',
                          padding: '6px 10px', borderRadius: '6px'
                        }}>
                          {c.id}
                        </code>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-main)' }}>{c.course || '—'}</div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{c.orgName || '—'}</div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.1)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
                          {c.aiScore ?? '—'}%
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        {c.revoked ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--accent-red)', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>
                            <XCircle size={14} /> Revoked
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>
                            <CheckCircle2 size={14} /> Active
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        {c.sbtTxHash ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--accent-purple)', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>
                            <GraduationCap size={14} /> Claimed
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>
                            <GraduationCap size={14} /> Not Claimed
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
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

  // Admin Dashboard
  return (
    <div className="view-wrapper">
      <ConfirmationDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearData}
        title="Clear All Data"
        message="Are you sure you want to permanently delete all metadata and activity history? This action cannot be undone."
        confirmText="Yes, Clear Data"
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="title-glow" style={{ margin: 0 }}>
            <LayoutDashboard size={28} color="var(--accent-cyan)" />
            <span className="text-gradient">Admin Dashboard</span>
          </h1>
          <div style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '14px' }}>
            Home &gt; Admin Dashboard
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          {['24h', '7d', '30d'].map(range => (
            <button
              key={range}
              onClick={() => setSelectedTimeRange(range)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: selectedTimeRange === range ? 'var(--accent-blue)' : 'transparent',
                color: selectedTimeRange === range ? '#fff' : 'var(--text-muted)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {range === '24h' ? '24 Hours' : range === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginTop: '32px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-panel" style={{ padding: '24px' }}>
              <Skeleton width="48px" height="48px" />
              <div style={{ marginTop: '20px' }}><Skeleton width="60%" height="32px" /></div>
              <div style={{ marginTop: '8px' }}><Skeleton width="40%" height="16px" /></div>
            </div>
          ))}
        </div>
      ) : !stats ? (
        <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', marginTop: '32px' }}>
          <AlertCircle size={56} color="var(--accent-red)" style={{ marginBottom: '20px', filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.4))' }} />
          <h2 style={{ color: 'var(--accent-red)', marginBottom: '12px' }}>Backend Connection Failed</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto 24px' }}>Unable to retrieve dashboard statistics. Ensure the Node.js backend and Hardhat node are running.</p>
          <button onClick={load} className="btn-3d" style={{ padding: '12px 24px' }}><RefreshCw size={18} style={{ marginRight: '8px' }} /> Retry Connection</button>
        </div>
      ) : (
        <div style={{ marginTop: '32px' }}>
          {/* Stat Widgets */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px', perspective: '1000px' }}>
            {cards.map((c, i) => (
              <div key={c.label} className="stat-card stagger-item" style={{ animationDelay: `${i * 0.1}s`, padding: '24px', borderRadius: '16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ padding: '10px', borderRadius: '12px', background: `${c.color}20` }}>
                    <c.icon size={24} color={c.color} style={{ filter: `drop-shadow(0 2px 4px ${c.color}66)` }} />
                  </div>
                  <span style={{ fontSize: '13px', background: c.trend.startsWith('+') ? 'rgba(16,185,129,0.1)' : c.trend.startsWith('-') ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px', color: c.trend.startsWith('+') ? 'var(--accent-green)' : c.trend.startsWith('-') ? 'var(--accent-red)' : 'var(--text-muted)', fontWeight: 700 }}>
                    {c.trend}
                  </span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-main)', marginBottom: '4px' }}>{c.value}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.02em' }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div className="stagger-item" style={{ animationDelay: '0.4s', display: 'flex', gap: '16px', marginBottom: '32px' }}>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="btn-danger" style={{ flex: 1, padding: '16px', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center', fontSize: '15px', fontWeight: 700, boxShadow: '0 8px 16px rgba(239,68,68,0.2)' }}
            >
              <Trash2 size={20} /> Clear Database
            </button>
            <button onClick={load} className="btn-3d" style={{
              flex: 1, padding: '16px', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', fontSize: '15px', fontWeight: 700
            }}>
              <RefreshCw size={20} /> Refresh Stats
            </button>
          </div>

          {stats.recent?.length > 0 && (
            <div className="glass-panel stagger-item" style={{ animationDelay: '0.5s', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}>
                  <History size={20} color="var(--accent-blue)" />
                  Live Chain Activity
                </h3>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '20px' }}>{stats.recent.length} recent entries</span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                  <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <tr>
                      <th style={{ padding: '16px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status</th>
                      <th style={{ padding: '16px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Recipient & Course</th>
                      <th style={{ padding: '16px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Certificate ID</th>
                      <th style={{ padding: '16px', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>AI Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent.map((c, idx) => (
                      <tr key={c.id} style={{ borderTop: '1px solid var(--glass-border)', transition: 'background 0.2s', animationDelay: `${idx * 0.05}s` }} className="fade-in" onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '16px' }}>
                          <div style={{
                            width: '40px', height: '40px', borderRadius: '50%',
                            background: c.revoked ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1px solid ${c.revoked ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`
                          }}>
                            {c.revoked ? <XCircle size={20} color="var(--accent-red)" /> : <CheckCircle size={20} color="var(--accent-green)" />}
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-main)', marginBottom: '4px' }}>{c.studentName}</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{c.course}</div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <code style={{
                            fontSize: '13px', color: 'var(--accent-purple)', fontFamily: 'monospace',
                            background: 'rgba(79,70,229,0.1)', border: '1px solid rgba(79,70,229,0.2)',
                            padding: '6px 10px', borderRadius: '6px'
                          }}>
                            {c.id}
                          </code>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.1)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
                            {c.aiScore ?? '—'}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;