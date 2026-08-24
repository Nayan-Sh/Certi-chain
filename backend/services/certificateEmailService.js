const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

// ── Build transporter (mirrors otpService) ─────────────────────────────────
function buildTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

// ── Compose + send certificate issuance email ──────────────────────────────
/**
 * Sends the student an email with the certificate details, verify link and a
 * scannable QR code right after the certificate is minted on-chain.
 *
 * @param {object} opts
 * @param {string} opts.to            - student email
 * @param {string} opts.studentName
 * @param {string} opts.course
 * @param {string} opts.orgName
 * @param {string} opts.certId
 * @param {string} opts.txHash
 * @returns {Promise<{success:boolean, mode:string, error?:string}>}
 */
async function sendCertificateEmail(opts) {
  const { to, studentName, course, orgName, certId, txHash } = opts;
  const verifyUrl = `${opts.verifyBaseUrl || process.env.APP_BASE_URL || 'http://localhost:5173'}/?verify=${certId}`;
  const transporter = buildTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@certifychain.com';

  // QR data URL embedded inline in the email (no external service needed)
  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 160, margin: 1 });
  } catch (err) {
    console.error('[CertEmail] QR generation failed:', err.message);
  }

  if (!transporter) {
    console.log('\n📧 [DEV MODE] Certificate email for ' + to);
    console.log('   Verify link: ' + verifyUrl + '\n');
    return { success: true, mode: 'console' };
  }

  const html = `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:auto;padding:32px;background:#f1f3f6;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#2874f0;font-size:24px;margin:0;">CertifyChain</h1>
        <p style="color:#64748b;margin:4px 0 0;">Blockchain Certificate Verification</p>
      </div>
      <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
        <h2 style="color:#0f172a;margin:0 0 6px;">Certificate Successfully Issued 🎉</h2>
        <p style="color:#64748b;margin:0 0 24px;">Your certificate has been secured on the blockchain. Download or share it anytime using the link below.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:8px 0;color:#64748b;width:45%;">Recipient</td><td style="padding:8px 0;font-weight:600;color:#0f172a;">${studentName || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Course / Credential</td><td style="padding:8px 0;font-weight:600;color:#0f172a;">${course || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Issuing Organization</td><td style="padding:8px 0;font-weight:600;color:#0f172a;">${orgName || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;">Certificate ID</td><td style="padding:8px 0;font-family:monospace;color:#0f172a;">${certId || '—'}</td></tr>
          ${txHash ? `<tr><td style="padding:8px 0;color:#64748b;">Transaction</td><td style="padding:8px 0;font-family:monospace;font-size:12px;color:#0f172a;word-break:break-all;">${txHash}</td></tr>` : ''}
        </table>
        <div style="text-align:center;background:#f1f3f6;border-radius:10px;padding:20px;">
          <p style="color:#64748b;font-size:13px;margin:0 0 10px;">Scan to verify</p>
          ${qrDataUrl ? `<img src="${qrDataUrl}" alt="Verify QR" width="140" height="140" style="border-radius:8px;"/>` : ''}
          <p style="margin:10px 0 0;"><a href="${verifyUrl}" style="color:#2874f0;font-weight:600;word-break:break-all;">${verifyUrl}</a></p>
        </div>
        <p style="color:#64748b;font-size:13px;margin:24px 0 0;">If you did not expect this certificate, please contact the issuing organization.</p>
      </div>
    </div>`;

  try {
    await transporter.sendMail({
      from: `"CertifyChain" <${from}>`,
      to,
      subject: `Your CertifyChain Certificate — ${course || 'Issued'}`,
      html,
    });
    return { success: true, mode: 'email' };
  } catch (err) {
    console.error('[CertEmail] Send failed:', err.message);
    console.log('\n📧 [FALLBACK] Certificate email for ' + to + ' → ' + verifyUrl + '\n');
    return { success: true, mode: 'console', error: err.message };
  }
}

module.exports = { sendCertificateEmail };
