import React from 'react';

function Skeleton({ width, height }) {
  return (
    <div style={{
      width: width || '100%',
      height: height || '20px',
      background: 'linear-gradient(90deg, rgba(142, 140, 140, 0.63) 25%, rgba(123, 106, 106, 1) 50%, rgba(255,255,255,0.05) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      borderRadius: '8px'
    }} />
  );

}

export default Skeleton;
