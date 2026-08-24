import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Plus, Trash2, RefreshCw, GraduationCap, AlertTriangle, CheckCircle2, Loader2
} from 'lucide-react';
import { trainingApi } from './api';

// ── Admin: AI Organization Training ──────────────────────────────────────────
// Teaches the AI which institutions this system issues/verifies certificates
// for. During bulk upload, the AI uses this trained registry to resolve the
// EXACT institution name even when it only appears inside a logo / stylized
// design (which is artwork, not extractable text). Each entry stores the
// canonical spelling + aliases + distinctive keywords, persisted by the AI
// service to ai-service/known_organizations.json.
export default function TrainAI({ showToast }) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Training form state
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [verifyHosts, setVerifyHosts] = useState('');

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await trainingApi.list();
      setOrgs(data.organizations || []);
    } catch (err) {
      setError(
        'Could not load trained organizations: ' +
        (err.response?.data?.message || err.message) +
        ' — make sure the AI service is running on port 5001.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const handleTrain = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) { showToast('Enter the institution name first', 'error'); return; }

    setSaving(true);
    setError('');
    try {
      const { data } = await trainingApi.train({
        name: trimmedName,
        aliases: aliases.split(',').map(s => s.trim()).filter(Boolean),
        verify_hosts: verifyHosts.split(',').map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '')).filter(Boolean),
      });
      showToast(data.updated ? `Updated "${trimmedName}" in AI training` : `AI trained on "${trimmedName}"`, 'success');
      setName('');
      setAliases('');
      setVerifyHosts('');
      await loadOrgs();
    } catch (err) {
      setError('Training failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleUntrain = async (orgName) => {
    if (!window.confirm(`Remove "${orgName}" from AI training? The AI will no longer recognize it automatically.`)) return;
    setError('');
    try {
      await trainingApi.untrain(orgName);
      showToast(`Removed "${orgName}" from AI training`, 'success');
      await loadOrgs();
    } catch (err) {
      setError('Could not remove: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="view-wrapper">
      <h1 className="title-glow text-gradient" style={{ margin: 0 }}>
        <Brain size={28} color="var(--accent-purple)" />
        <span>AI Organization Training</span>
      </h1>
      <p style={{ color: 'var(--text-muted)', margin: '8px 0 24px', fontSize: '14px', lineHeight: 1.6 }}>
        Teach the AI to recognize your institutions. During <strong>bulk upload</strong>, the AI matches each
        certificate's logo / stylized header against this registry and returns the <strong>exact</strong>{' '}
        registered name — even when the name is artwork inside or under the logo and has no extractable text.
      </p>

      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          color: 'var(--accent-red)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* ── Add / update an organization ──────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GraduationCap size={18} color="var(--accent-cyan)" /> Add or Update an Institution
        </h3>
        <form onSubmit={handleTrain}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                Exact institution name <span style={{ color: 'var(--accent-red)' }}>*</span>
              </label>
              <input
                className="input-3d"
                placeholder="e.g. Indian Institute of Technology, Delhi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                Aliases / abbreviations (comma-separated)
              </label>
              <input
                className="input-3d"
                placeholder="e.g. IIT Delhi, IITD, Indian Institute of Technology (IIT) Delhi"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              Verify URL hosts (comma-separated, optional) — e.g. <code>verify.iitd.ac.in</code>
            </label>
            <input
              className="input-3d"
              placeholder="e.g. verify.iitd.ac.in, iitd.ac.in"
              value={verifyHosts}
              onChange={(e) => setVerifyHosts(e.target.value)}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            {saving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            {saving ? 'Training…' : 'Train AI'}
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '14px' }}>
            Adding an existing name updates it; the AI hot-reloads it immediately.
          </span>
        </form>
      </div>

      {/* ── Trained organizations list ────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GraduationCap size={18} color="var(--accent-cyan)" /> Trained Institutions
            <span style={{
              background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)',
              borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: 700
            }}>
              {orgs.length}
            </span>
          </h3>
          <button className="btn-3d" onClick={loadOrgs} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px' }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Loader2 size={16} className="spin" /> Loading trained organizations…
          </p>
        ) : orgs.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '32px 16px', borderRadius: '10px',
            background: 'rgba(0,0,0,0.15)', border: '1px dashed var(--glass-border)'
          }}>
            <Brain size={28} color="var(--text-muted)" style={{ opacity: 0.5 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>
              No institutions trained yet. Add your first one above — the AI will then auto-fill the
              institution name during bulk upload even if it only appears in the certificate logo.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {orgs.map((org) => (
              <div key={org.name} style={{
                padding: '16px', borderRadius: '12px',
                background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>{org.name}</div>
                  <button
                    onClick={() => handleUntrain(org.name)}
                    title="Remove from AI training"
                    style={{
                      background: 'transparent', border: 'none', color: 'var(--accent-red)',
                      cursor: 'pointer', padding: '2px', flexShrink: 0, opacity: 0.7
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {org.aliases?.length > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <strong>Aliases:</strong> {org.aliases.join(', ')}
                  </div>
                )}
                {org.keywords?.length > 0 && (
                  <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <strong>Keywords:</strong> {org.keywords.join(', ')}
                  </div>
                )}
                {org.verify_hosts?.length > 0 && (
                  <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <strong>Verify hosts:</strong> {org.verify_hosts.join(', ')}
                  </div>
                )}
                <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={12} /> Used by AI during bulk upload extraction
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
