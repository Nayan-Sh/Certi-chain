// ── Utility Functions ────────────────────────────────────────────────────────────
import CryptoJS from 'crypto-js';

// Generate unique certificate ID
export const genId = () => `CERT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

// Truncate Ethereum address for display
export const truncateAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

// Format ISO timestamp into separate date + time strings
export const fmtDateTime = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
};

// Copy text to clipboard with fallback
export const copyToClipboard = async (text, showToast) => {
  try {
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!', 'success');
      return;
    }

    // Fallback for non-secure contexts (HTTP)
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (successful) {
      showToast('Copied to clipboard!', 'success');
    } else {
      showToast('Failed to copy - please copy manually', 'error');
    }
  } catch (err) {
    showToast('Failed to copy - please copy manually', 'error');
    console.error('Copy failed:', err);
  }
};

// Compute SHA-256 hash of a file
export async function computeFileHash(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target.result;

      // Try native WebCrypto first (requires HTTPS or localhost)
      if (window.crypto && window.crypto.subtle) {
        try {
          const hashBuf = await window.crypto.subtle.digest('SHA-256', buffer);
          const hashHex = Array.from(new Uint8Array(hashBuf))
            .map(b => b.toString(16).padStart(2, '0')).join('');
          return resolve(hashHex);
        } catch (err) {
          console.warn("Native crypto failed, using fallback...");
        }
      }

      // Fallback: crypto-js for mobile devices on local network without HTTPS
      const wordBuffer = CryptoJS.lib.WordArray.create(buffer);
      const hashHex = CryptoJS.SHA256(wordBuffer).toString(CryptoJS.enc.Hex);
      resolve(hashHex);
    };
    reader.readAsArrayBuffer(file);
  });
}

// Print HTML content in a new window
export const printHtml = (title, bodyHtml) => {
  const win = window.open('', '_blank', 'width=820,height=960');
  if (!win) {
    alert('Please allow pop-ups for this site to print your receipt.');
    return;
  }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; background:#fff; color:#111; font-family: Arial, Helvetica, sans-serif; }
  .sheet { max-width:680px; margin:0 auto; padding:40px; }
  .logo { text-align:center; margin-bottom:10px; }
  .brand { margin:4px 0 2px; font-size:26px; font-weight:800; color:#0f172a; }
  .brand-sub { margin:0 0 20px; color:#64748b; font-size:13px; }
  h2.title { text-align:center; margin:0 0 20px; padding-bottom:18px; border-bottom:2px solid #111; color:#0d9488; font-size:18px; letter-spacing:.06em; }
  table { width:100%; border-collapse:collapse; margin:0 0 20px; }
  td { padding:10px 0; border-bottom:1px solid #e2e8f0; font-size:14px; vertical-align:top; }
  td.k { width:42%; color:#475569; font-weight:700; }
  td.v { color:#0f172a; font-weight:500; word-break:break-all; }
  .block { margin:0 0 18px; }
  .block p { margin:0 0 6px; font-weight:700; font-size:12px; color:#475569; }
  .hash { font-family:'Courier New',monospace; font-size:11px; word-break:break-all; background:#f1f5f9; padding:10px; border-radius:6px; }
  .qr { text-align:center; margin:22px 0 0; padding-top:18px; border-top:1px solid #e2e8f0; }
  .qr p { margin:0 0 8px; font-size:12px; color:#475569; }
  .qr a { color:#2563eb; font-size:11px; word-break:break-all; }
  .foot { margin-top:26px; text-align:center; font-size:11px; color:#94a3b8; line-height:1.7; }
  @media print { .sheet { padding:16px; } }
</style></head><body><div class="sheet">${bodyHtml}</div></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
};

// QR code SVG renderer
export const qrSvg = (url) => {
  // This will be imported from qrcode.react in components
  return url;
};

// Read a file as Data URL
export const readFileAsDataURL = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};