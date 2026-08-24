import React from 'react';

const AppLogo = ({ size = 40 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block', margin: '0 auto 8px' }}>
    <defs>
      <linearGradient id="cc-g1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#00b4d8' }} />
        <stop offset="100%" style={{ stopColor: '#00f2fe' }} />
      </linearGradient>
      <linearGradient id="cc-g2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#22428bff' }} />
        <stop offset="100%" style={{ stopColor: '#30425eff' }} />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#cc-g2)" stroke="url(#cc-g1)" strokeWidth="2" />
    <path d="M32 10 L48 17 L48 32 C48 42 40 49 32 52 C24 49 16 42 16 32 L16 17 Z" fill="url(#cc-g1)" opacity="0.9" />
    <polyline points="23,33 29,39 41,27" fill="none" stroke="#020617" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="20" cy="52" r="4" fill="none" stroke="url(#cc-g1)" strokeWidth="2" />
    <circle cx="44" cy="52" r="4" fill="none" stroke="url(#cc-g1)" strokeWidth="2" />
    <line x1="24" y1="52" x2="40" y2="52" stroke="url(#cc-g1)" strokeWidth="2" />
  </svg>
);

export default AppLogo;
