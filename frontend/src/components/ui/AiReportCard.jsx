import React from 'react';
import { Shield, ShieldCheck, ShieldAlert, Sparkles, ChevronDown, CheckCircle, AlertTriangle } from 'lucide-react';

function AiReportCard({ trust_score, details, ai_safe, ai_message, compact }) {
  if (trust_score === undefined) return null;
  const scoreColor = trust_score >= 70 ? 'var(--accent-green)' : trust_score >= 40 ? '#f59e0b' : 'var(--accent-red)';
  const pct = Math.max(0, Math.min(100, trust_score));

  if (compact) {
    return (
      <div style={{
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.05)',
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: ai_safe ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {ai_safe ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
          {ai_safe ? 'AI VERIFIED — Authentic Document' : 'AI FORENSIC DANGER'}
        </h3>
      </div>

      {/* Trust score 3D Glowing Bar */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
          <span>AI Trust Score</span>
          <span style={{ color: scoreColor, fontWeight: 800, textShadow: `0 0 10px ${scoreColor}` }}>{pct}%</span>
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
          <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '13px', lineHeight: 1.5 }}>
            {details?.llm_forensic_report || ai_message}
          </p>
        </div>
      )}

      {/* Detail grid */}
      {details?.field_results ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
            {Object.entries(details.field_results).map(([key, fr]) => {
              const matched = fr.matched !== false;
              const score = fr.match_score || 0;
              const isCritical = fr.is_critical !== false;
              return (
                <div key={key} style={{
                  padding: '10px 14px', borderRadius: '10px',
                  background: matched ? 'rgba(16,185,129,0.1)' : (isCritical ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)'),
                  border: `1px solid ${matched ? 'rgba(16,185,129,0.2)' : (isCritical ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)')}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      {fr.field || key}
                      {isCritical && <span style={{ color: 'var(--accent-red)', marginLeft: '4px', fontSize: '10px' }}>●</span>}
                    </span>
                    <span style={{
                      color: matched ? 'var(--accent-green)' : (isCritical ? 'var(--accent-red)' : '#f59e0b'),
                      fontSize: '11px',
                      fontWeight: 600
                    }}>
                      {score}% {matched ? '✅' : '❌'}
                    </span>
                  </div>
                  {!matched && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      <div>Expected: "{fr.expected?.substring(0, 40)}"</div>
                      <div>Found: "{fr.extracted?.substring(0, 40) || 'NOT FOUND'}"</div>
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{
              padding: '10px 14px', borderRadius: '10px',
              background: !details?.tampering_detected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${!details?.tampering_detected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Image Forensics</span>
              <span style={{ filter: 'drop-shadow(0 0 5px currentColor)' }}>{!details?.tampering_detected ? '✅' : '❌'}</span>
            </div>
          </div>
          {/* Extracted fields summary */}
          {details?.extracted_fields && Object.values(details.extracted_fields).some(v => v) && (
            <div style={{
              marginTop: '12px', padding: '12px',
              background: 'rgba(99,102,241,0.08)',
              borderRadius: '8px',
              border: '1px solid rgba(99,102,241,0.15)',
              fontSize: '11px',
              color: 'var(--text-muted)'
            }}>
              <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>📋 Extracted from Document: </span>
              {Object.entries(details.extracted_fields)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k.replace(/_/g, ' ')}: "${v.substring(0, 30)}"`)
                .join(' | ')}
            </div>
          )}
        </>
      ) : (
        /* Fallback to legacy detail grid */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
          {[
            { label: 'Name OCR Match', val: details?.name_matched },
            { label: 'Course OCR Match', val: details?.course_matched },
            { label: 'Org OCR Match', val: details?.org_matched },
            { label: 'Image Forensics', val: !details?.tampering_detected },
          ].map(({ label, val }) => (
            <div key={label} style={{
              padding: '10px 14px', borderRadius: '10px',
              background: val ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${val ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ filter: 'drop-shadow(0 0 5px currentColor)' }}>{val ? '✅' : '❌'}</span>
            </div>
          ))}
        </div>
      )}

      {details?.ocr_notes && (
        <p style={{ margin: '14px 0 0', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--glass-border)', paddingTop: '10px' }}>
          📝 {details.ocr_notes}
        </p>
      )}
    </div>
  );
}

export default AiReportCard;
