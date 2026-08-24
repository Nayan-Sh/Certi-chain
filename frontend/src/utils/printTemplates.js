import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import AppLogo from '../components/ui/AppLogo';
import { fmtDateTime } from './helpers';

// Build receipt HTML for printing after certificate issuance
export const buildReceiptHtml = (result) => {
  const issued = fmtDateTime(result.issuedAt);
  const verifyUrl = `${window.location.protocol}//${window.location.host}/?verify=${result.certId}`;
  return `
    <div class="logo">${renderToStaticMarkup(createElement(AppLogo, { size: 52 }))}</div>
    <div style="text-align:center">
      <div class="brand">CertifyChain</div>
      <div class="brand-sub">Blockchain Certificate Verification System</div>
    </div>
    <h2 class="title">CERTIFICATE ISSUANCE RECEIPT</h2>
    <table>
      <tr><td class="k">Receipt / Certificate ID</td><td class="v">${result.certId || '—'}</td></tr>
      <tr><td class="k">Recipient Name</td><td class="v">${result.studentName || '—'}</td></tr>
      <tr><td class="k">Course / Credential</td><td class="v">${result.course || '—'}</td></tr>
      <tr><td class="k">Issuing Organization</td><td class="v">${result.orgName || '—'}</td></tr>
      <tr><td class="k">Issue Date</td><td class="v">${issued?.date || '—'}</td></tr>
      <tr><td class="k">Issue Time</td><td class="v">${issued?.time || '—'}</td></tr>
      <tr><td class="k">Status</td><td class="v">ISSUED / ACTIVE</td></tr>
      <tr><td class="k">AI Trust Score</td><td class="v">${result.trust_score ?? '—'}%</td></tr>
    </table>
    ${result.txHash ? `<div class="block"><p>BLOCKCHAIN TRANSACTION HASH</p><div class="hash">${result.txHash}</div></div>` : ''}
    ${result.fileHash ? `<div class="block"><p>FILE HASH (SHA-256)</p><div class="hash">${result.fileHash}</div></div>` : ''}
    <div class="qr">
      <p>Scan to verify this certificate</p>
      ${renderToStaticMarkup(createElement(QRCodeSVG, { value: verifyUrl, size: 130 }))}
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    </div>
    <div class="foot">
      <div>Printed On: ${new Date().toLocaleString()}</div>
      <div>This receipt was generated automatically by CertifyChain.</div>
      <div>Blockchain-secured certificate verification system.</div>
    </div>`;
};

// Build certificate HTML for printing after verification
export const buildCertificateHtml = (result) => {
  const issued = fmtDateTime(result.issuedAt);
  const verified = fmtDateTime(result.verifiedAt);
  const certId = result.id || result.certId;
  const verifyUrl = `${window.location.protocol}//${window.location.host}/?verify=${certId}`;
  return `
    <div class="logo">${renderToStaticMarkup(createElement(AppLogo, { size: 52 }))}</div>
    <div style="text-align:center">
      <div class="brand">CertifyChain</div>
      <div class="brand-sub">Blockchain Certificate Verification System</div>
    </div>
    <h2 class="title" style="color:${result.revoked ? '#dc2626' : '#0d9488'}">${result.revoked ? 'CERTIFICATE REVOKED' : 'CERTIFICATE VERIFICATION'}</h2>
    <table>
      <tr><td class="k">Certificate ID</td><td class="v">${certId || '—'}</td></tr>
      <tr><td class="k">Recipient Name</td><td class="v">${result.studentName || '—'}</td></tr>
      <tr><td class="k">Course / Credential</td><td class="v">${result.course || '—'}</td></tr>
      <tr><td class="k">Issuing Organization</td><td class="v">${result.orgName || '—'}</td></tr>
      ${result.issuedAt ? `<tr><td class="k">Issue Date</td><td class="v">${issued?.date || '—'}</td></tr><tr><td class="k">Issue Time</td><td class="v">${issued?.time || '—'}</td></tr>` : ''}
      ${result.verifiedAt ? `<tr><td class="k">Verified Date</td><td class="v">${verified?.date || '—'}</td></tr><tr><td class="k">Verified Time</td><td class="v">${verified?.time || '—'}</td></tr>` : ''}
      <tr><td class="k">Status</td><td class="v">${result.revoked ? 'REVOKED' : 'ACTIVE'}</td></tr>
      ${result.aiScore !== null && result.aiScore !== undefined ? `<tr><td class="k">AI Trust Score</td><td class="v">${result.aiScore}%</td></tr>` : ''}
    </table>
    ${result.txHash ? `<div class="block"><p>BLOCKCHAIN TRANSACTION HASH</p><div class="hash">${result.txHash}</div></div>` : ''}
    ${result.storedFileHash ? `<div class="block"><p>FILE HASH (SHA-256)</p><div class="hash">${result.storedFileHash}</div></div>` : ''}
    <div class="qr">
      <p>Scan to verify this certificate</p>
      ${renderToStaticMarkup(createElement(QRCodeSVG, { value: verifyUrl, size: 130 }))}
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    </div>
    <div class="foot">
      <div>Verified On: ${result.verifiedAt ? new Date(result.verifiedAt).toLocaleString() : new Date().toLocaleString()}</div>
      <div>Printed On: ${new Date().toLocaleString()}</div>
      <div>Blockchain-secured certificate verification system.</div>
    </div>`;
};