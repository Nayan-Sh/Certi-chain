import React from 'react';
import Skeleton from './Skeleton';

function StatTile({ label, value, color }) {
  return (
    <div style={{
      textAlign: 'center', padding: '16px 12px', borderRadius: '12px',
      background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)',
    }}>
      <div style={{ fontSize: '24px', fontWeight: 800, color, marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

export default StatTile;
