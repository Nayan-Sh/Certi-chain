import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, CheckCircle2, ChevronRight,
  AlertCircle, Building2, User, ShieldCheck, RefreshCw,
  Phone, Hash, UserPlus
} from 'lucide-react';
import { authApi } from './api';

// ── OTP Input Component ─────────────────────────────────────────────────────
function OtpInput({ value, onChange }) {
  const inputs = useRef([]);
  const digits = value.split('');

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits];
        next[idx] = '';
        onChange(next.join(''));
      } else if (idx > 0) {
        inputs.current[idx - 1]?.focus();
      }
    }
  };

  const handleInput = (e, idx) => {
    const val = e.target.value.replace(/\D/g, '').slice(-1);
    const next = [...Array(6)].map((_, i) => digits[i] || '');
    next[idx] = val;
    onChange(next.join(''));
    if (val && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted.padEnd(6, '').slice(0, 6));
    inputs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
      {[...Array(6)].map((_, idx) => (
        <input
          key={idx}
          ref={el => inputs.current[idx] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[idx] || ''}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          onInput={(e) => handleInput(e, idx)}
          onPaste={handlePaste}
          style={{
            width: '48px', height: '56px', textAlign: 'center',
            fontSize: '20px', fontWeight: 700,
            fontFamily: 'Space Grotesk, monospace',
            background: 'var(--bg-dark)', color: 'var(--text-main)',
            borderRadius: '12px',
            border: `2px solid ${digits[idx] ? 'var(--accent-blue)' : 'var(--glass-border)'}`,
            outline: 'none',
            transition: 'all 0.15s ease',
          }}
        />
      ))}
    </div>
  );
}

// ── Main Signup Component ────────────────────────────────────────────────────
export default function Signup({ setUserRole, showToast }) {
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);
  const googleInitialized = useRef(false);

  // Initialize Google Identity Services button
  useEffect(() => {
    const initGoogle = () => {
      if (typeof window !== 'undefined' && window.google?.accounts?.id && googleBtnRef.current && !googleInitialized.current) {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (clientId && clientId !== 'your-google-client-id.apps.googleusercontent.com') {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredentialResponse,
          });
          window.google.accounts.id.renderButton(
            googleBtnRef.current,
            { theme: 'outline', size: 'large', width: '250', text: 'continue_with' }
          );
          googleInitialized.current = true;
          return true;
        }
      }
      return googleInitialized.current;
    };

    if (!initGoogle()) {
      const intervalId = setInterval(() => {
        if (initGoogle()) clearInterval(intervalId);
      }, 200);
      return () => clearInterval(intervalId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleCredentialResponse = async (response) => {
    await handleGoogleAuth(response.credential);
  };

  // Step tracking: 1=Form, 2=OTP, 3=Success
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('student');
  const [formData, setFormData] = useState({
    fullName: '', email: '', phone: '',
    rollNumber: '', institution: '', adminId: '', inviteCode: '',
    password: '', confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpResendTimer, setOtpResendTimer] = useState(0);

  // Fix stale closure for Google Auth callback
  const latestData = useRef({ role, inviteCode: formData.inviteCode });
  useEffect(() => {
    latestData.current = { role, inviteCode: formData.inviteCode };
  }, [role, formData.inviteCode]);

  const startResendTimer = () => {
    setOtpResendTimer(30);
    const t = setInterval(() => {
      setOtpResendTimer(prev => {
        if (prev <= 1) { clearInterval(t); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // Google OAuth handler
  const handleGoogleAuth = async (credential) => {
    setIsSubmitting(true);
    try {
      const currentRole = latestData.current.role;
      const currentInvite = latestData.current.inviteCode;
      
      // Client-side validation if admin
      if (currentRole === 'admin' && !currentInvite.trim()) {
        showToast('Admin Invite Code is required for Google Sign-Up', 'error');
        setIsSubmitting(false);
        return;
      }

      const res = await authApi.googleAuth(credential, currentRole, currentInvite);
      localStorage.setItem('certifychain_token', res.data.token);
      localStorage.setItem('certifychain_user', JSON.stringify(res.data.user));
      setUserRole(res.data.user.role || 'student');
      navigate('/dashboard');
      showToast(`Welcome, ${res.data.user.fullName || 'User'}!`, 'success');
    } catch (err) {
      console.error('Google Auth Error:', err);
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Google sign-up failed';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const validateStep1 = () => {
    const newErrors = {};
    if (!formData.fullName || formData.fullName.length < 2)
      newErrors.fullName = 'Full name is required (min 2 characters)';
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      newErrors.email = 'Valid email is required';
    if (!formData.phone || formData.phone.length < 10)
      newErrors.phone = 'Valid 10-digit phone number is required';
    if (!formData.password || formData.password.length < 6)
      newErrors.password = 'Password must be at least 6 characters';
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = 'Passwords do not match';
    if (role === 'student' && !formData.rollNumber)
      newErrors.rollNumber = 'Roll number is required for students';
    if (role === 'student' && !formData.institution.trim())
      newErrors.institution = 'Institution is required for students';
    if (role === 'admin' && !formData.adminId)
      newErrors.adminId = 'Admin ID is required';
    if (role === 'admin' && !formData.inviteCode)
      newErrors.inviteCode = 'Invite code is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  // Step 1 → 2: Send OTP
  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!validateStep1()) return;

    setIsSubmitting(true);
    try {
      const res = await authApi.sendOtp(formData.email);
      // Show dev code in development mode if returned
      if (res.data.devCode) {
        showToast(`DEV MODE OTP: ${res.data.devCode} (Check console)`, 'info');
      }
      setStep(2);
      startResendTimer();
      showToast('OTP sent to your email', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send OTP', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2 → 3: Verify OTP & Register
  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      showToast('Please enter the complete 6-digit OTP', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      // Build the registration payload matching backend expectations
      const payload = {
        role,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      };

      if (role === 'admin') {
        payload.adminId = formData.adminId;
        payload.inviteCode = formData.inviteCode;
      } else {
        payload.fullName = formData.fullName;
        payload.rollNumber = formData.rollNumber;
        payload.institution = formData.institution;
      }

      const res = await authApi.signup(payload, otp);

      localStorage.setItem('certifychain_token', res.data.token);
      localStorage.setItem('certifychain_user', JSON.stringify(res.data.user));
      setUserRole(res.data.user.role || role);
      setStep(3);
    } catch (err) {
      showToast(err.response?.data?.message || err.response?.data?.error || 'Registration failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpResendTimer > 0) return;
    try {
      const res = await authApi.sendOtp(formData.email);
      // Show dev code in development mode if returned
      if (res.data.devCode) {
        showToast(`DEV MODE OTP: ${res.data.devCode} (Check console)`, 'info');
      }
      startResendTimer();
      showToast('OTP resent successfully', 'success');
    } catch {
      showToast('Failed to resend OTP', 'error');
    }
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-dark)',
    }}>
      {/* ── Header ────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10, 10, 15, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--glass-border)',
        padding: '0 32px', height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/" style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          textDecoration: 'none', color: 'var(--text-main)',
          fontWeight: 800, fontSize: '18px',
        }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShieldCheck size={20} color="white" />
          </div>
          CertifyChain
        </Link>

        {/* Step Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              {s > 1 && (
                <div style={{
                  width: '28px', height: '1px',
                  background: step > s - 1 ? 'var(--accent-blue)' : 'var(--glass-border)',
                  transition: 'background 0.3s',
                }} />
              )}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                fontSize: '12px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step >= s
                  ? 'var(--accent-blue)'
                  : 'rgba(0,0,0,0.05)',
                color: step >= s ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.3s ease',
              }}>
                {step > s ? <CheckCircle2 size={14} /> : s}
              </div>
            </React.Fragment>
          ))}
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────── */}
      <main style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px',
      }}>
        <div style={{ width: '100%', maxWidth: '500px' }}>
          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h1 className="title-glow" style={{ margin: '0 0 8px', fontSize: '28px', justifyContent: 'center' }}>
              <span className="text-gradient">
                {step === 3 ? 'Welcome Aboard!' : 'Create Account'}
              </span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
              {step === 3
                ? 'Your CertifyChain account is ready'
                : step === 2
                  ? 'Verify your email to continue'
                  : 'Join the next-gen certificate verification platform'
              }
            </p>
          </div>

          {/* ═══ STEP 1: Registration Form ═══ */}
          {step === 1 && (
            <>
              {/* Role Toggle */}
              <div style={{
                display: 'flex', background: 'rgba(0,0,0,0.04)',
                borderRadius: '14px', padding: '4px', marginBottom: '28px',
                border: '1px solid var(--glass-border)',
              }}>
                {[
                  { key: 'student', label: 'Student', icon: User },
                  { key: 'admin', label: 'Admin / Issuer', icon: Building2 },
                ].map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setRole(key); setErrors({}); }}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: '10px',
                      fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                      border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      background: role === key ? 'var(--accent-blue)' : 'transparent',
                      color: role === key ? '#fff' : 'var(--text-muted)',
                      transition: 'all 0.2s ease',
                      boxShadow: role === key ? '0 2px 8px rgba(29,78,216,0.3)' : 'none',
                    }}
                  >
                    {React.createElement(icon, { size: 16 })}{label}
                  </button>
                ))}
              </div>

              {/* Form */}
              <form onSubmit={handleSendOtp} className="glass-panel" style={{ padding: '32px' }}>
                {/* Full Name */}
                <FieldRow label="Full Name" error={errors.fullName} icon={<User size={18} />}>
                  <input
                    name="fullName" type="text" value={formData.fullName}
                    onChange={handleChange}
                    placeholder="John Doe"
                    style={inputStyle}
                  />
                </FieldRow>

                {/* Email */}
                <FieldRow label="Email Address" error={errors.email} icon={<Mail size={18} />}>
                  <input
                    name="email" type="email" value={formData.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    style={inputStyle}
                  />
                </FieldRow>

                <FieldRow label="Phone Number" error={errors.phone} icon={<Phone size={18} />}>
                  <input
                    name="phone" type="tel" value={formData.phone}
                    onChange={handleChange}
                    placeholder="+91 9876543210"
                    style={inputStyle}
                  />
                </FieldRow>

                {/* Role-specific fields */}
                {role === 'student' ? (
                  <>
                    <FieldRow label="Roll Number" error={errors.rollNumber} icon={<Hash size={18} />}>
                      <input
                        name="rollNumber" type="text" value={formData.rollNumber}
                        onChange={handleChange}
                        placeholder="CS2024001"
                        style={inputStyle}
                      />
                    </FieldRow>
                    <FieldRow label="Institution" error={errors.institution} icon={<Building2 size={18} />}>
                      <input
                        name="institution" type="text" value={formData.institution}
                        onChange={handleChange}
                        placeholder="Your University or College"
                        style={inputStyle}
                      />
                    </FieldRow>
                  </>
                ) : (
                  <>
                    <FieldRow label="Admin ID" error={errors.adminId} icon={<Building2 size={18} />}>
                      <input
                        name="adminId" type="text" value={formData.adminId}
                        onChange={handleChange}
                        placeholder="ADMIN-001"
                        style={inputStyle}
                      />
                    </FieldRow>
                    <FieldRow label="Admin Invite Code" error={errors.inviteCode} icon={<Lock size={18} />}>
                      <input
                        name="inviteCode" type="password" value={formData.inviteCode}
                        onChange={handleChange}
                        placeholder="Required for admin registration"
                        style={inputStyle}
                      />
                    </FieldRow>
                  </>
                )}

                {/* Password */}
                <FieldRow label="Password" error={errors.password} icon={<Lock size={18} />}
                  suffix={
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {showPassword
                        ? <EyeOff size={18} color="var(--text-muted)" />
                        : <Eye size={18} color="var(--text-muted)" />
                      }
                    </button>
                  }>
                  <input
                    name="password" type={showPassword ? 'text' : 'password'}
                    value={formData.password} onChange={handleChange}
                    placeholder="Min 6 characters"
                    style={inputStyle}
                  />
                </FieldRow>

                {/* Confirm Password */}
                <FieldRow label="Confirm Password" error={errors.confirmPassword} icon={<CheckCircle2 size={18} />}>
                  <input
                    name="confirmPassword" type="password"
                    value={formData.confirmPassword} onChange={handleChange}
                    placeholder="Re-enter your password"
                    style={inputStyle}
                  />
                </FieldRow>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary"
                  style={{
                    width: '100%', padding: '14px', borderRadius: '12px',
                    fontSize: '15px', fontWeight: 700, marginTop: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <div className="spinner" style={{
                        width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                      }} />
                      Sending OTP...
                    </>
                  ) : (
                    <>
                      Send OTP <ChevronRight size={18} />
                    </>
                  )}
                </button>

                {/* Terms */}
                <p style={{
                  textAlign: 'center', marginTop: '20px', marginBottom: 0,
                  fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6,
                }}>
                  By signing up, you agree to our{' '}
                  <span style={{ color: 'var(--accent-blue)', fontWeight: 500, cursor: 'pointer' }}>Terms of Service</span>
                  {' '}and{' '}
                  <span style={{ color: 'var(--accent-blue)', fontWeight: 500, cursor: 'pointer' }}>Privacy Policy</span>
                </p>

                {/* Google Sign-In Divider */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  marginTop: '24px', marginBottom: '24px',
                  color: 'var(--text-muted)', fontSize: '13px'
                }}>
                  <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
                  <span style={{ fontWeight: 500 }}>or continue with</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
                </div>

                {/* Google Sign-In Button */}
                {role === 'admin' && !formData.inviteCode.trim() && (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
                    Fill in your Admin Invite Code above to enable Google Sign-Up
                  </p>
                )}
                <div style={{ width: '100%', display: (role === 'admin' && !formData.inviteCode.trim()) ? 'none' : 'flex', justifyContent: 'center' }}>
                  <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center' }} />
                </div>

                <p style={{
                  textAlign: 'center', marginTop: '20px', marginBottom: 0,
                  fontSize: '14px', color: 'var(--text-muted)',
                }}>
                  Already have an account?{' '}
                  <Link to="/login" style={{
                    color: 'var(--accent-blue)', fontWeight: 600, textDecoration: 'none',
                  }}>
                    Sign in <ChevronRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                  </Link>
                </p>
              </form>
            </>
          )}

          {/* ═══ STEP 2: OTP Verification ═══ */}
          {step === 2 && (
            <div className="glass-panel" style={{ padding: '40px 32px', textAlign: 'center' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '16px',
                background: 'rgba(79,70,229,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <Mail size={28} color="var(--accent-purple)" />
              </div>
              <h2 style={{ color: 'var(--text-main)', fontSize: '20px', margin: '0 0 8px' }}>
                Verify Your Email
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '0 0 28px' }}>
                We sent a 6-digit code to{' '}
                <strong style={{ color: 'var(--text-main)' }}>{formData.email}</strong>
              </p>

              <OtpInput value={otp} onChange={setOtp} />

              <button
                onClick={handleVerifyOtp}
                disabled={isSubmitting || otp.length !== 6}
                className="btn-primary"
                style={{
                  width: '100%', padding: '14px', borderRadius: '12px',
                  fontSize: '15px', fontWeight: 700, marginTop: '28px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  opacity: (isSubmitting || otp.length !== 6) ? 0.7 : 1,
                }}
              >
                {isSubmitting ? (
                  <>
                    <div className="spinner" style={{
                      width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                    }} />
                    Verifying...
                  </>
                ) : (
                  <>Verify & Register <UserPlus size={18} /></>
                )}
              </button>

              <div style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={otpResendTimer > 0}
                  style={{
                    background: 'none', border: 'none', cursor: otpResendTimer > 0 ? 'not-allowed' : 'pointer',
                    color: otpResendTimer > 0 ? 'var(--text-muted)' : 'var(--accent-blue)',
                    fontSize: '13px', fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: '6px', margin: '0 auto',
                  }}
                >
                  <RefreshCw size={14} style={{
                    animation: otpResendTimer > 0 ? 'spin 1s linear infinite' : 'none',
                  }} />
                  {otpResendTimer > 0 ? `Resend in ${otpResendTimer}s` : 'Resend OTP'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '13px',
                  marginTop: '12px',
                }}
              >
                ← Back to edit details
              </button>
            </div>
          )}

          {/* ═══ STEP 3: Success ═══ */}
          {step === 3 && (
            <div className="glass-panel" style={{ padding: '40px 32px', textAlign: 'center' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%',
                background: 'rgba(16,185,129,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <CheckCircle2 size={36} color="var(--accent-green)" />
              </div>
              <h2 style={{ color: 'var(--text-main)', fontSize: '22px', margin: '0 0 8px' }}>
                Registration Complete!
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '0 0 28px' }}>
                Your account has been created successfully. You're now ready to issue and verify
                blockchain-secured certificates.
              </p>
              <button
                onClick={handleGoToDashboard}
                className="btn-primary"
                style={{
                  width: '100%', padding: '14px', borderRadius: '12px',
                  fontSize: '15px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                Go to Dashboard <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* Security Badge */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)',
          }}>
            <ShieldCheck size={14} />
            <span>Your data is secured with blockchain encryption</span>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer style={{
        textAlign: 'center', padding: '20px',
        fontSize: '12px', color: 'var(--text-muted)',
        borderTop: '1px solid var(--glass-border)',
      }}>
        © 2026 CertifyChain. All rights reserved.
      </footer>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Reusable Field Row Component ──────────────────────────────────────────
function FieldRow({ label, error, icon, suffix, children }) {
  const hasError = !!error;
  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={{
        display: 'block', fontSize: '13px', fontWeight: 600,
        color: 'var(--text-main)', marginBottom: '6px',
      }}>
        {label}
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px',
        background: 'var(--bg-dark)',
        borderRadius: '12px',
        border: `1px solid ${hasError ? 'var(--accent-red)' : 'var(--glass-border)'}`,
        transition: 'border-color 0.2s ease',
      }}>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{icon}</span>
        {children}
        {hasError && <AlertCircle size={16} color="var(--accent-red)" />}
        {suffix && <span style={{ flexShrink: 0 }}>{suffix}</span>}
      </div>
      {error && (
        <p style={{
          margin: '6px 0 0', fontSize: '12px',
          color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  );
}

const inputStyle = {
  flex: 1, border: 'none', outline: 'none',
  background: 'transparent', fontSize: '14px',
  color: 'var(--text-main)',
  fontFamily: 'inherit',
};
