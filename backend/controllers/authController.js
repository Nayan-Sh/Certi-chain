const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendOTPEmail, verifyOTP, isOTPVerified, clearVerifiedOTP } = require('../services/otpService');
const { OAuth2Client } = require('google-auth-library');

// Fail fast if JWT_SECRET is missing — never fall back to a hardcoded secret
// in production. Set it in backend/.env (see backend/.env.example).
if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not set. Add it to backend/.env (see backend/.env.example).'
  );
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

// Google OAuth Client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
console.log('[Google OAuth] GOOGLE_CLIENT_ID configured:', !!GOOGLE_CLIENT_ID, GOOGLE_CLIENT_ID ? '(set)' : '(NOT SET)');
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// ── Login brute-force protection (in-memory) ───────────────────────────────
// Tracks failed attempts per "email|IP". After MAX_LOGIN_ATTEMPTS failures the
// key is locked for LOCKOUT_MINUTES. In-memory is fine for a single instance;
// swap for Redis if you ever scale horizontally.
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
const LOCKOUT_MS = parseInt(process.env.LOCKOUT_MINUTES || '15', 10) * 60 * 1000;
const loginAttempts = new Map(); // key -> { count, lockUntil }

const attemptKey = (email, ip) => `${email.toLowerCase()}|${ip}`;

function isLocked(key) {
  const rec = loginAttempts.get(key);
  if (!rec) return false;
  if (rec.lockUntil && rec.lockUntil > Date.now()) return true;
  if (rec.lockUntil && rec.lockUntil <= Date.now()) loginAttempts.delete(key);
  return false;
}

function lockRemainingSeconds(key) {
  const rec = loginAttempts.get(key);
  if (!rec || !rec.lockUntil) return 0;
  return Math.max(1, Math.ceil((rec.lockUntil - Date.now()) / 1000));
}

function recordFailure(key) {
  const rec = loginAttempts.get(key) || { count: 0, lockUntil: null };
  rec.count += 1;
  if (rec.count >= MAX_LOGIN_ATTEMPTS) {
    rec.lockUntil = Date.now() + LOCKOUT_MS;
    rec.count = 0;
  }
  loginAttempts.set(key, rec);
}

function clearFailures(key) {
  loginAttempts.delete(key);
}

// ── POST /api/auth/send-otp ───────────────────────────────────────────────
exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const result = await sendOTPEmail(email.trim().toLowerCase());

    const response = { message: 'OTP sent successfully.' };
    // In dev/fallback mode, return the code to show in toast
    if (result.devCode) response.devCode = result.devCode;

    res.json(response);
  } catch (err) {
    console.error('sendOtp error:', err);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
};

// ── POST /api/auth/verify-otp ─────────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });

    const result = await verifyOTP(email.trim().toLowerCase(), otp.trim());
    if (!result.valid) return res.status(400).json({ error: result.reason });

    res.json({ message: 'OTP verified successfully.' });
  } catch (err) {
    console.error('verifyOtp error:', err);
    res.status(500).json({ error: 'OTP verification failed. Please try again.' });
  }
};

// ── POST /api/auth/register ───────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const {
      role, email, phone, password,
      // Admin fields
      adminId,
      // Student fields
      fullName, rollNumber, institution,
    } = req.body;

    if (!role || !email || !phone || !password) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (!['admin', 'student'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }

    // Check OTP verification
    const emailLower = email.toLowerCase();
    const otpVerified = await isOTPVerified(emailLower);
    if (!otpVerified) {
      return res.status(403).json({ error: 'Email not verified. Please complete OTP verification first.' });
    }

    // Check duplicates
    const existingEmail = await User.findOne({ email: emailLower });
    if (existingEmail) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(409).json({ error: 'An account with this phone number already exists.' });
    }

    // Build user object
    const userData = {
      role,
      email: emailLower,
      phone,
      password,
      isVerified: true,
    };

    if (role === 'admin') {
      if (!adminId) return res.status(400).json({ error: 'Admin ID is required.' });
      userData.adminId = adminId.toUpperCase();
    } else {
      if (!fullName || !rollNumber || !institution) {
        return res.status(400).json({ error: 'Full name, roll number, and institution are required.' });
      }
      userData.fullName = fullName;
      userData.rollNumber = rollNumber;
      userData.institution = institution;
    }

    const user = await User.create(userData);

    // Clear the verified OTP after successful registration
    await clearVerifiedOTP(emailLower);

    // Issue JWT
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.status(201).json({
      message: 'Registration successful.',
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        fullName: user.fullName || user.adminId,
      },
    });
  } catch (err) {
    console.error('register error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email or phone already registered.' });
    }
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    console.log('[DEBUG login] === LOGIN REQUEST RECEIVED ===');
    console.log('[DEBUG login] Request body:', { identifier: req.body.identifier, hasPassword: !!req.body.password, role: req.body.role });
    console.log('[DEBUG login] Request headers:', req.headers);
    console.log('[DEBUG login] Request IP:', req.ip);
    const { identifier, password, role } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifier and password are required.' });
    }

    const trimmedIdentifier = identifier.trim();
    const lowerIdentifier = trimmedIdentifier.toLowerCase();

    // Find by email, adminId, or rollNumber (case-insensitive for adminId)
    let user;
    if (lowerIdentifier.includes('@')) {
      // Looks like an email
      user = await User.findOne({ email: lowerIdentifier });
    } else if (trimmedIdentifier.toUpperCase().startsWith('ADMIN-')) {
      // Looks like an Admin ID (case-insensitive)
      const adminIdUpper = trimmedIdentifier.toUpperCase();
      console.log('[DEBUG login] Searching for adminId:', adminIdUpper);
      user = await User.findOne({ adminId: adminIdUpper });
      console.log('[DEBUG login] Found admin user:', user ? { email: user.email, adminId: user.adminId } : null);
    } else {
      // Could be rollNumber or email without @ (fallback)
      // rollNumber search should be case-insensitive
      console.log('[DEBUG login] Searching for rollNumber:', trimmedIdentifier);
      user = await User.findOne({
        $or: [
          { rollNumber: { $regex: `^${trimmedIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
          { email: lowerIdentifier }
        ]
      });
      console.log('[DEBUG login] Found user:', user ? { email: user.email, rollNumber: user.rollNumber } : null);
    }

    if (!user) {
      // For lockout, we can't reliably identify the user without finding them first
      // Record failure with a generic key based on identifier+IP
      const key = attemptKey(lowerIdentifier, req.ip);
      recordFailure(key);
      return res.status(401).json({ error: 'No account found with these credentials.' });
    }

    // Now use the actual email for brute-force protection
    const actualEmailKey = attemptKey(user.email, req.ip);
    if (isLocked(actualEmailKey)) {
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${lockRemainingSeconds(actualEmailKey)} seconds.`,
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: 'Account not verified. Please complete OTP verification.' });
    }

    // Optional role check — ensure user is logging into the correct portal
    if (role && user.role !== role) {
      return res.status(403).json({
        error: `This account is registered as a ${user.role}. Please use the ${user.role} login.`,
      });
    }

    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      recordFailure(actualEmailKey);
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    // Successful login — reset the failure counter for this identity
    clearFailures(actualEmailKey);

    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        fullName: user.fullName || user.adminId || user.email,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};

// ── GET /api/auth/check-email ─────────────────────────────────────────────
exports.checkEmail = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    const exists = await User.findOne({ email: email.toLowerCase() });
    res.json({ exists: !!exists });
  } catch (err) {
    res.status(500).json({ error: 'Check failed.' });
  }
};

// ── POST /api/auth/google ───────────────────────────────────────────────────
// Google OAuth login / signup
exports.googleAuth = async (req, res) => {
  try {
    const { credential } = req.body; // Google ID token from frontend

    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required.' });
    }

    if (!googleClient) {
      return res.status(500).json({ error: 'Google OAuth not configured. Please contact administrator.' });
    }

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, sub: googleId, name, picture, email_verified } = payload;

    if (!email_verified) {
      return res.status(400).json({ error: 'Google email not verified.' });
    }

    const emailLower = email.toLowerCase();

    // Check if user exists
    let user = await User.findOne({ email: emailLower });

    if (user) {
      // Existing user - link Google ID if not already linked
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
      // Ensure user is verified
      if (!user.isVerified) {
        user.isVerified = true;
        await user.save();
      }
    } else {
      // New user - create account (default to student role)
      // Google users don't need phone/password since they auth via Google
      user = await User.create({
        role: 'student', // Default to student; can change later
        email: emailLower,
        googleId,
        isVerified: true,
        fullName: name || null,
        phone: '', // Empty for Google OAuth users
        password: '', // Not used for Google OAuth
      });
    }

    // Issue JWT
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      message: 'Google authentication successful.',
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        fullName: user.fullName || user.adminId || user.email,
      },
    });
  } catch (err) {
    console.error('googleAuth error:', err);
    if (err.message?.includes('Token used too late') || err.message?.includes('Invalid token')) {
      return res.status(401).json({ error: 'Invalid or expired Google token. Please try again.' });
    }
    res.status(500).json({ error: 'Google authentication failed. Please try again.' });
  }
};
