import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

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
export default Toast;