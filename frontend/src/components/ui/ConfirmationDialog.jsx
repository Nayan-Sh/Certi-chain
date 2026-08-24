import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

function ConfirmationDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', confirmStyle = 'danger' }) {
  if (!isOpen) return null;

  const btnClass = confirmStyle === 'danger' ? 'btn-danger' : 'btn-3d';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000
    }}>
      <div style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        padding: '24px',
        maxWidth: '400px',
        width: '90%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        animation: 'slideUp 0.3s ease-out'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              padding: '8px', 
              borderRadius: '50%', 
              background: confirmStyle === 'danger' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              color: confirmStyle === 'danger' ? 'var(--accent-red)' : 'var(--accent-green)'
            }}>
              <AlertTriangle size={24} />
            </div>
            <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '18px', fontWeight: 600 }}>{title}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>
        
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '24px' }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button 
            onClick={onClose}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--glass-border)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-main)',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Cancel
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className={btnClass}
            style={{ padding: '10px 16px', borderRadius: '8px', fontWeight: 600 }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmationDialog;
