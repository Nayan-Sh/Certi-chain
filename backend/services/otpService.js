const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const OTP = require('../models/OTP');

// ── Build transporter ─────────────────────────────────────────────────────
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

// ── Generate and store OTP ────────────────────────────────────────────────
async function generateOTP(email) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Remove any existing unused OTPs for this email
  await OTP.deleteMany({ email: email.toLowerCase() });

  const hashedOtp = await bcrypt.hash(code, 10);
  await OTP.create({
    email: email.toLowerCase(),
    otp: hashedOtp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  });

  return code;
}

// ── Send OTP via email ────────────────────────────────────────────────────
async function sendOTPEmail(email) {
  const code = await generateOTP(email);
  const transporter = buildTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@certifychain.com';

  if (!transporter) {
    // Dev fallback: log OTP to console and return it
    console.log(`\n🔐 [DEV MODE] OTP for ${email}: ${code}\n`);
    return { success: true, devCode: code, mode: 'console' };
  }

  try {
    await transporter.sendMail({
      from: `"CertifyChain" <${from}>`,
      to: email,
      subject: 'Your CertifyChain Verification OTP',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:auto;padding:32px;background:#f1f3f6;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#2874f0;font-size:24px;margin:0;">CertifyChain</h1>
            <p style="color:#64748b;margin:4px 0 0;">Blockchain Certificate Verification</p>
          </div>
          <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
            <h2 style="color:#0f172a;margin:0 0 8px;">Your Verification Code</h2>
            <p style="color:#64748b;margin:0 0 24px;">Use this OTP to complete your registration. It expires in <strong>10 minutes</strong>.</p>
            <div style="text-align:center;background:#f1f3f6;border-radius:10px;padding:24px;letter-spacing:12px;font-size:36px;font-weight:700;color:#2874f0;">
              ${code}
            </div>
            <p style="color:#64748b;font-size:13px;margin:24px 0 0;">If you didn't request this, please ignore this email.</p>
          </div>
        </div>`,
    });
    return { success: true, mode: 'email' };
  } catch (err) {
    // If email fails, fall back to console logging
    console.error('Email send failed:', err.message);
    console.log(`\n🔐 [FALLBACK] OTP for ${email}: ${code}\n`);
    return { success: true, devCode: code, mode: 'console', error: err.message };
  }
}

// ── Verify OTP ────────────────────────────────────────────────────────────
async function verifyOTP(email, inputCode) {
  const record = await OTP.findOne({
    email: email.toLowerCase(),
    used: false,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    return { valid: false, reason: 'OTP expired or not found. Please request a new one.' };
  }

  const isMatch = await bcrypt.compare(inputCode, record.otp);
  if (!isMatch) {
    return { valid: false, reason: 'Incorrect OTP. Please try again.' };
  }

  // Mark as used and verified
  record.used = true;
  record.verified = true;
  await record.save();

  return { valid: true };
}

// ── Check if OTP was verified for email ───────────────────────────────────
async function isOTPVerified(email) {
  const record = await OTP.findOne({
    email: email.toLowerCase(),
    verified: true,
    used: true,
    expiresAt: { $gt: new Date() },
  });
  return !!record;
}

// ── Clear verified OTP after registration ─────────────────────────────────
async function clearVerifiedOTP(email) {
  await OTP.deleteMany({ email: email.toLowerCase() });
}

module.exports = { sendOTPEmail, verifyOTP, isOTPVerified, clearVerifiedOTP };
