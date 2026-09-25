import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, ChevronRight, AlertCircle,
  Building2, User, ShieldCheck, Sparkles, LogIn
} from 'lucide-react';
import { authApi } from './api';

export default function Login({ setUserRole, showToast }) {
  const navigate = useNavigate();
  const [role, setRole] = useState('admin');
  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
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

  const handleGoogleAuth = async (credential) => {
    setIsGoogleLoading(true);
    try {
      const res = await authApi.googleAuth(credential, role, undefined, true);
      localStorage.setItem('certifychain_token', res.data.token);
      localStorage.setItem('certifychain_user', JSON.stringify(res.data.user));
      setUserRole(res.data.user.role || 'student');
      navigate('/dashboard');
      showToast(`Welcome, ${res.data.user.fullName || 'User'}!`, 'success');
    } catch (err) {
      console.error('Google Auth Error:', err);
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Google sign-in failed';
      showToast(msg, 'error');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.identifier) {
      newErrors.identifier = role === 'admin'
        ? 'Email or Admin ID is required'
        : 'Email or Roll Number is required';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const res = await authApi.login(formData.identifier, formData.password, role);

      localStorage.setItem('certifychain_token', res.data.token);
      localStorage.setItem('certifychain_user', JSON.stringify(res.data.user));
      setUserRole(res.data.user.role);  // use exact role from server, never default to 'admin'
      navigate('/dashboard');
      showToast(`Welcome back, ${res.data.user.fullName || res.data.user.name || res.data.user.email}!`, 'success');
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Login failed';
      if (err.response?.status === 404 || msg.toLowerCase().includes('no user found') || msg.toLowerCase().includes('sign up first')) {
        setErrors(prev => ({ ...prev, identifier: msg }));
      }
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-dark)',
    }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10, 10, 15, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--glass-border)',
        padding: '0 32px',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
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
        <Link to="/" style={{
          color: 'var(--text-muted)', fontSize: '14px',
          textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          ← Back to Home
        </Link>
      </header>

      {/* ── Main Content ────────────────────────────────────── */}
      <main style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px',
      }}>
        <div style={{
          width: '100%', maxWidth: '460px',
        }}>
          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h1 className="title-glow" style={{ margin: '0 0 8px', fontSize: '28px', justifyContent: 'center' }}>
              <span className="text-gradient">Welcome Back</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
              Sign in to access your CertifyChain dashboard
            </p>
          </div>

          {/* Role Toggle */}
          <div style={{
            display: 'flex', background: 'rgba(0,0,0,0.04)',
            borderRadius: '14px', padding: '4px', marginBottom: '28px',
            border: '1px solid var(--glass-border)',
          }}>
            {[
              { key: 'admin', label: 'Admin', icon: Building2 },
              { key: 'student', label: 'Student', icon: User },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
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
                {React.createElement(icon, { size: 16 })}
                {label}
              </button>
            ))}
          </div>

          {/* Form Card */}
          <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '32px' }}>
            {/* Identifier */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>
                {role === 'admin' ? 'Email or Admin ID' : 'Email or Roll Number'}
              </label>
              <div style={inputWrapperStyle(errors.identifier)}>
                <Mail size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  name="identifier"
                  type="text"
                  placeholder={role === 'admin' ? 'admin@certifychain.com' : 'student@college.edu'}
                  value={formData.identifier}
                  onChange={handleChange}
                  style={inputStyle}
                />
                {errors.identifier && <AlertCircle size={16} color="var(--accent-red)" />}
              </div>
              {errors.identifier && <p style={errorStyle}>{errors.identifier}</p>}
            </div>

            {/* Password */}
            <div style={{ marginBottom: '8px' }}>
              <label style={labelStyle}>Password</label>
              <div style={inputWrapperStyle(errors.password)}>
                <Lock size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {showPassword
                    ? <EyeOff size={18} color="var(--text-muted)" />
                    : <Eye size={18} color="var(--text-muted)" />
                  }
                </button>
              </div>
              {errors.password && <p style={errorStyle}>{errors.password}</p>}
            </div>

            {/* Forgot Password Link */}
            <div style={{ textAlign: 'right', marginBottom: '24px' }}>
              <span style={{
                color: 'var(--accent-blue)', fontSize: '13px',
                cursor: 'pointer', fontWeight: 500,
              }}>
                Forgot password?
              </span>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                fontSize: '15px', fontWeight: 700,
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
                  Signing in...
                </>
              ) : (
                <>
                  Sign In <LogIn size={18} />
                </>
              )}
            </button>

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
            <div id="google-btn-login" aria-busy={isGoogleLoading} style={{ width: '100%', display: 'flex', justifyContent: 'center', opacity: isGoogleLoading ? 0.6 : 1 }}>
              <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center' }} />
            </div>

            {/* Footer Link */}
            <p style={{
              textAlign: 'center', marginTop: '24px', marginBottom: 0,
              fontSize: '14px', color: 'var(--text-muted)',
            }}>
              Don't have an account?{' '}
              <Link to="/signup" style={{
                color: 'var(--accent-blue)', fontWeight: 600, textDecoration: 'none',
              }}>
                Create one <ChevronRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </Link>
            </p>
          </form>

          {/* Security Notice */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)',
          }}>
            <ShieldCheck size={14} />
            <span>Secured with blockchain-grade encryption</span>
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
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

// ── Shared Style Helpers ────────────────────────────────────────────────────
const labelStyle = {
  display: 'block', fontSize: '13px', fontWeight: 600,
  color: 'var(--text-main)', marginBottom: '6px',
};

const inputWrapperStyle = (hasError) => ({
  display: 'flex', alignItems: 'center', gap: '10px',
  padding: '12px 16px',
  background: 'var(--bg-dark)',
  borderRadius: '12px',
  border: `1px solid ${hasError ? 'var(--accent-red)' : 'var(--glass-border)'}`,
  transition: 'border-color 0.2s ease',
});

const inputStyle = {
  flex: 1, border: 'none', outline: 'none',
  background: 'transparent', fontSize: '14px',
  color: 'var(--text-main)',
  fontFamily: 'inherit',
};

const errorStyle = {
  margin: '6px 0 0', fontSize: '12px',
  color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '4px',
};
