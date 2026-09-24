import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScroll, useTransform, AnimatePresence, motion } from 'framer-motion';
import {
  ShieldCheck, FileSearch, Lock, Cpu, Database, QrCode, Zap,
  ArrowRight, ChevronRight, Github, Twitter, Linkedin,
  CheckCircle, Globe, Users, Award, TrendingUp, Star,
  Menu, X, Sparkles, Shield, Eye, Hash
} from 'lucide-react';
import api from './api';

// ── Animation Variants ────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } }
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
};

// ── Animated Counter ──────────────────────────────────────────────────────────
function Counter({ end, suffix = '', duration = 2 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        setStarted(true);
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let start = 0;
    const step = end / (duration * 60);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [started, end, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── Floating Particle ─────────────────────────────────────────────────────────
function Particle({ style }) {
  return (
    <motion.div
      style={style}
      animate={{ y: [0, -30, 0], opacity: [0.3, 0.7, 0.3] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      className="absolute w-1 h-1 rounded-full bg-blue-400/40"
    />
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '25%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  // Fetch stats from backend
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/api/certificates/stats');
        if (res.data && typeof res.data === 'object') {
          setStatsData(res.data);
        }
      } catch (err) {
        console.warn('Could not fetch stats, using defaults:', err.message);
      }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'How It Works', href: '#workflow' },
    { label: 'Technology', href: '#tech' },
  ];

  const features = [
    { icon: Lock, title: 'Blockchain Security', desc: 'Immutable records stored on decentralized ledgers, permanently preventing unauthorized modifications or fraud.', color: 'from-blue-500 to-cyan-400' },
    { icon: Hash, title: 'SHA-256 Hashing', desc: 'Advanced cryptographic hashing guarantees document integrity. Even a single pixel change invalidates the hash.', color: 'from-violet-500 to-purple-400' },
    { icon: Database, title: 'IPFS Storage', desc: 'Decentralized file storage ensures certificates are never lost, censored, or controlled by a single entity.', color: 'from-emerald-500 to-teal-400' },
    { icon: QrCode, title: 'QR Verification', desc: "Instant verification by scanning a QR code. Anyone, anywhere, can confirm a certificate's authenticity in seconds.", color: 'from-orange-500 to-amber-400' },
    { icon: Zap, title: 'Instant Results', desc: 'Sub-second cryptographic verification without relying on central authorities or manual certificate checks.', color: 'from-yellow-500 to-orange-400' },
    { icon: Shield, title: 'Tamper Detection', desc: 'AI-assisted anomaly detection flags altered or forged documents instantly before verification completes.', color: 'from-red-500 to-pink-400' },
    { icon: Eye, title: 'Student Dashboard', desc: 'A beautiful personal portal for students to view, manage, download, and share their verified credentials.', color: 'from-sky-500 to-blue-400' },
    { icon: Sparkles, title: 'Admin Dashboard', desc: 'Powerful institutional tools to bulk-issue, revoke, track, and audit all certificates in one unified interface.', color: 'from-indigo-500 to-violet-400' },
  ];

  // Default stats (0 initially, will be replaced by fetched data)
  const defaultStats = [
    { value: 0, suffix: '+', label: 'Certificates Verified', icon: CheckCircle },
    { value: 0, suffix: '+', label: 'Partner Institutions', icon: Award },
    { value: 0, suffix: '+', label: 'Students Onboarded', icon: Users },
    { value: 0, suffix: '%', label: 'Fraud Prevention Rate', icon: TrendingUp },
  ];

  // Use fetched stats or defaults
  const stats = statsData ? [
    { value: statsData.total || 0, suffix: '+', label: 'Certificates Verified', icon: CheckCircle },
    { value: statsData.partnerInstitutions || 0, suffix: '+', label: 'Partner Institutions', icon: Award },
    { value: statsData.studentsOnboarded || 0, suffix: '+', label: 'Students Onboarded', icon: Users },
    { value: statsData.fraudPreventionRate || 0, suffix: '%', label: 'Fraud Prevention Rate', icon: TrendingUp },
  ] : defaultStats;

  const workflow = [
    { num: '01', title: 'Upload PDF', desc: 'Institution uploads the official certificate PDF through the secure admin dashboard.' },
    { num: '02', title: 'Generate Hash', desc: 'System computes a unique SHA-256 cryptographic fingerprint of the document.' },
    { num: '03', title: 'Mint on Chain', desc: 'The hash is permanently recorded on the Ethereum blockchain — immutable forever.' },
    { num: '04', title: 'Share & Verify', desc: 'Students receive a QR code. Anyone can scan and verify authenticity instantly.' },
    { num: '05', title: 'Confirmed Trust', desc: 'Cryptographic match confirmed. Certificate is 100% genuine and tamper-proof.' },
  ];

  const techStack = ['React.js', 'Node.js', 'Express', 'MongoDB', 'Ethereum', 'Solidity', 'IPFS / Pinata', 'JWT Auth', 'Python AI', 'Hardhat'];

  return (
    <div style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", background: '#020617', color: '#f1f5f9', overflowX: 'hidden' }}>

      {/* ── Sticky Navbar ───────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          transition: 'all 0.3s ease',
          background: isScrolled ? 'rgba(2,6,23,0.92)' : 'transparent',
          backdropFilter: isScrolled ? 'blur(20px)' : 'none',
          borderBottom: isScrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
          padding: isScrolled ? '14px 0' : '24px 0',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', padding: '10px', borderRadius: '12px', boxShadow: '0 0 20px rgba(59,130,246,0.4)' }}>
              <ShieldCheck size={22} color="#fff" />
            </div>
            <span style={{ fontWeight: 800, fontSize: '20px', letterSpacing: '-0.03em', color: '#f8fafc' }}>CertifyChain</span>
          </div>

          {/* Desktop Nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '36px' }} className="hidden md:flex">
            {navLinks.map(link => (
              <a key={link.label} href={link.href} style={{ color: '#94a3b8', fontSize: '15px', fontWeight: 500, textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => e.target.style.color = '#f1f5f9'}
                onMouseLeave={e => e.target.style.color = '#94a3b8'}>
                {link.label}
              </a>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate('/login')}
              style={{ padding: '9px 20px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#cbd5e1', fontWeight: 600, fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.target.style.borderColor = 'rgba(255,255,255,0.3)'; e.target.style.color = '#fff'; }}
              onMouseLeave={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.color = '#cbd5e1'; }}>
              Log In
            </button>
            <button onClick={() => navigate('/signup')}
              style={{ padding: '9px 22px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', border: 'none', boxShadow: '0 4px 20px rgba(59,130,246,0.35)', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 8px 25px rgba(59,130,246,0.5)'; }}
              onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 4px 20px rgba(59,130,246,0.35)'; }}>
              Get Started
            </button>
            {/* Mobile hamburger */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{ display: 'none', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              className="md:hidden block">
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              style={{ background: 'rgba(2,6,23,0.98)', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '16px 24px' }}>
              {navLinks.map(link => (
                <a key={link.label} href={link.href} onClick={() => setMobileMenuOpen(false)}
                  style={{ display: 'block', padding: '12px 0', color: '#94a3b8', fontSize: '16px', fontWeight: 500, textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {link.label}
                </a>
              ))}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button onClick={() => { navigate('/login'); setMobileMenuOpen(false); }}
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#cbd5e1', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
                  Log In
                </button>
                <button onClick={() => { navigate('/signup'); setMobileMenuOpen(false); }}
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', border: 'none' }}>
                  Get Started
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* ── Hero Section ────────────────────────────────────────────────────── */}
      <section ref={heroRef} style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        {/* Animated background */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.25) 0%, transparent 65%), radial-gradient(ellipse 40% 40% at 80% 60%, rgba(139,92,246,0.12) 0%, transparent 60%), #020617' }} />
        {/* Grid pattern */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '60px 60px', maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent)' }} />
        {/* Floating orbs */}
        <div style={{ position: 'absolute', top: '15%', left: '5%', width: '320px', height: '320px', background: 'radial-gradient(circle, rgba(59,130,246,0.12), transparent)', borderRadius: '50%', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '5%', width: '280px', height: '280px', background: 'radial-gradient(circle, rgba(139,92,246,0.12), transparent)', borderRadius: '50%', filter: 'blur(60px)' }} />

        <motion.div style={{ y: heroY, opacity: heroOpacity, width: '100%' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '120px 24px 80px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'center' }}
            className="hero-grid">
            {/* Left column */}
            <motion.div initial="hidden" animate="visible" variants={stagger}>
              <motion.div variants={fadeUp}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px 6px 8px', borderRadius: '50px', border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)', marginBottom: '28px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={11} color="#fff" />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#93c5fd', letterSpacing: '0.03em' }}>Web3 Powered · Blockchain Verified</span>
                </div>
              </motion.div>

              <motion.h1 variants={fadeUp} style={{ fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em', marginBottom: '24px', color: '#f8fafc' }}>
                Digital Trust,<br />
                <span style={{ background: 'linear-gradient(135deg, #60a5fa, #34d399, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  Secured on Chain.
                </span>
              </motion.h1>

              <motion.p variants={fadeUp} style={{ fontSize: '18px', lineHeight: 1.75, color: '#94a3b8', marginBottom: '40px', maxWidth: '520px' }}>
                Eradicate credential fraud with immutable blockchain-based certificate verification. Generate cryptographic hashes, store on IPFS, and verify with absolute certainty — in seconds.
              </motion.p>

              <motion.div variants={fadeUp} style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <button onClick={() => navigate('/verify')}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 28px', borderRadius: '14px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', fontWeight: 700, fontSize: '16px', cursor: 'pointer', border: 'none', boxShadow: '0 8px 30px rgba(59,130,246,0.4)', transition: 'all 0.25s' }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                  <FileSearch size={19} /> Verify Certificate
                </button>
                <button onClick={() => navigate('/signup')}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 28px', borderRadius: '14px', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontWeight: 700, fontSize: '16px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', transition: 'all 0.25s', backdropFilter: 'blur(10px)' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}>
                  Get Started Free <ArrowRight size={19} />
                </button>
              </motion.div>

              <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '40px', paddingTop: '32px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex' }}>
                  {['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'].map((c, i) => (
                    <div key={i} style={{ width: '32px', height: '32px', borderRadius: '50%', background: c, border: '2px solid #020617', marginLeft: i > 0 ? '-10px' : 0 }} />
                  ))}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                    {[1,2,3,4,5].map(i => <Star key={i} size={13} fill="#f59e0b" color="#f59e0b" />)}
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginLeft: '4px' }}>4.9</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Trusted by 0+ institutions worldwide</span>
                </div>
              </motion.div>
            </motion.div>

            {/* Right column — Certificate Card */}
            <motion.div initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="hero-card" style={{ position: 'relative' }}>
              {/* Glow behind card */}
              <div style={{ position: 'absolute', inset: '-20px', background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(59,130,246,0.15), transparent)', borderRadius: '32px', filter: 'blur(20px)' }} />
              <div style={{ position: 'relative', background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '32px', backdropFilter: 'blur(20px)', boxShadow: '0 40px 80px rgba(0,0,0,0.5)' }}>
                {/* Window chrome */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['#ef4444','#f59e0b','#22c55e'].map(c => <div key={c} style={{ width: '12px', height: '12px', borderRadius: '50%', background: c }} />)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#4ade80', letterSpacing: '0.05em' }}>VERIFIED ON CHAIN</span>
                  </div>
                </div>
                {/* Certificate body */}
                <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                  <motion.div animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ width: '72px', height: '72px', background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', boxShadow: '0 0 40px rgba(59,130,246,0.4)' }}>
                    <ShieldCheck size={36} color="#fff" />
                  </motion.div>
                  <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em', marginBottom: '6px' }}>Certificate of Excellence</h3>
                  <p style={{ color: '#64748b', fontSize: '14px' }}>Awarded to <span style={{ color: '#e2e8f0', fontWeight: 700 }}>Jane Doe</span></p>
                  <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>B.Tech Computer Science · 2024</p>
                </div>
                {/* Hash fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { label: 'CERT HASH', value: '0x4f8a...92bc', color: '#60a5fa' },
                    { label: 'TX HASH', value: '0x9812...73ea', color: '#34d399' },
                    { label: 'BLOCK', value: '#18,432,901', color: '#a78bfa' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.08em' }}>{label}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color }}>{value}</span>
                    </div>
                  ))}
                </div>
                {/* Verify button */}
                <button onClick={() => navigate('/verify')}
                  style={{ width: '100%', marginTop: '20px', padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(6,182,212,0.2))', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.35), rgba(6,182,212,0.35))'}
                  onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(6,182,212,0.2))'}>
                  <FileSearch size={16} /> Verify This Certificate
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
          style={{ position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)' }}>
          <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 1.5, repeat: Infinity }}
            style={{ width: '28px', height: '44px', borderRadius: '14px', border: '2px solid rgba(255,255,255,0.15)', display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
            <div style={{ width: '4px', height: '8px', borderRadius: '2px', background: 'rgba(255,255,255,0.3)' }} />
          </motion.div>
        </motion.div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 0', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }} className="stats-grid">
            {stats.map((stat, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.6 }}
                style={{ textAlign: 'center', padding: '32px 20px', borderRadius: '20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, transparent, ${['#3b82f6','#8b5cf6','#10b981','#f59e0b'][i]}, transparent)` }} />
                <div style={{ fontSize: 'clamp(32px,5vw,48px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f1f5f9', marginBottom: '8px' }}>
                  <Counter end={stat.value} suffix={stat.suffix} />
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: '120px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger} style={{ textAlign: 'center', marginBottom: '72px' }}>
            <motion.p variants={fadeUp} style={{ fontSize: '13px', fontWeight: 700, color: '#3b82f6', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px' }}>Enterprise Architecture</motion.p>
            <motion.h2 variants={fadeUp} style={{ fontSize: 'clamp(32px,5vw,56px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f8fafc', marginBottom: '20px', lineHeight: 1.1 }}>
              Built for absolute security
            </motion.h2>
            <motion.p variants={fadeUp} style={{ fontSize: '18px', color: '#64748b', maxWidth: '560px', margin: '0 auto', lineHeight: 1.7 }}>
              Every component is engineered to prevent fraud, ensure immutability, and deliver instant verification at any scale.
            </motion.p>
          </motion.div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }} className="features-grid">
            {features.map((feat, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ delay: (i % 4) * 0.08, duration: 0.6 }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                style={{ padding: '28px', borderRadius: '20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'default', position: 'relative', overflow: 'hidden', transition: 'border-color 0.3s' }}>
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, rgba(59,130,246,0.04), transparent)`, opacity: 0 }} />
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: `linear-gradient(135deg, ${feat.color.replace('from-','').replace(' to-',' , ')})`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', boxShadow: '0 8px 20px rgba(0,0,0,0.3)' }}>
                  <feat.icon size={22} color="#fff" />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#f1f5f9', marginBottom: '10px', letterSpacing: '-0.01em' }}>{feat.title}</h3>
                <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.7 }}>{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflow ──────────────────────────────────────────────────────── */}
      <section id="workflow" style={{ padding: '120px 0', background: 'linear-gradient(180deg, transparent, rgba(59,130,246,0.04), transparent)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger} style={{ textAlign: 'center', marginBottom: '80px' }}>
            <motion.p variants={fadeUp} style={{ fontSize: '13px', fontWeight: 700, color: '#3b82f6', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px' }}>Simple Process</motion.p>
            <motion.h2 variants={fadeUp} style={{ fontSize: 'clamp(32px,5vw,56px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f8fafc', lineHeight: 1.1 }}>
              How verification works
            </motion.h2>
          </motion.div>

          <div style={{ position: 'relative' }}>
            {/* Connecting line */}
            <div style={{ position: 'absolute', top: '40px', left: '10%', right: '10%', height: '2px', background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.4), rgba(139,92,246,0.4), rgba(16,185,129,0.4), transparent)', display: 'none' }} className="workflow-line" />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '24px' }} className="workflow-grid">
              {workflow.map((step, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ delay: i * 0.12, duration: 0.6 }}
                  style={{ textAlign: 'center', position: 'relative' }}>
                  <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '24px' }}>
                    <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(59,130,246,0.1)', border: '2px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 900, color: '#60a5fa', boxShadow: '0 0 30px rgba(59,130,246,0.15)', fontFamily: 'monospace' }}>
                      {step.num}
                    </div>
                    {i < workflow.length - 1 && (
                      <ChevronRight size={18} color="rgba(59,130,246,0.3)" style={{ position: 'absolute', right: '-30px', top: '50%', transform: 'translateY(-50%)' }} className="hidden md:block" />
                    )}
                  </div>
                  <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#f1f5f9', marginBottom: '10px', letterSpacing: '-0.01em' }}>{step.title}</h4>
                  <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.7 }}>{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Tech Stack ────────────────────────────────────────────────────── */}
      <section id="tech" style={{ padding: '80px 0', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#475569', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '32px' }}>Powered by modern Web3 technologies</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
            {techStack.map((tech, i) => (
              <motion.div key={tech} initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.05, y: -2 }}
                style={{ padding: '10px 20px', borderRadius: '50px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '14px', fontWeight: 600, color: '#94a3b8', cursor: 'default', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={14} color="#3b82f6" />
                {tech}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────────────────── */}
      <section style={{ padding: '120px 0' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={stagger}>
            <motion.div variants={scaleIn} style={{ position: 'relative', padding: '72px 48px', borderRadius: '32px', background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1))', border: '1px solid rgba(59,130,246,0.2)', overflow: 'hidden' }}>
              {/* Background glow */}
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(59,130,246,0.08), transparent)', pointerEvents: 'none' }} />

              <motion.h2 variants={fadeUp} style={{ fontSize: 'clamp(32px,5vw,56px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#f8fafc', marginBottom: '20px', lineHeight: 1.1 }}>
                Ready to eliminate<br />credential fraud?
              </motion.h2>
              <motion.p variants={fadeUp} style={{ fontSize: '18px', color: '#94a3b8', marginBottom: '40px', lineHeight: 1.7 }}>
                Join hundreds of institutions already protecting their reputation and students with blockchain-grade certificate security.
              </motion.p>
              <motion.div variants={fadeUp} style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => navigate('/signup')}
                  style={{ padding: '16px 32px', borderRadius: '14px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', fontWeight: 700, fontSize: '16px', cursor: 'pointer', border: 'none', boxShadow: '0 8px 30px rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.25s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 40px rgba(59,130,246,0.5)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(59,130,246,0.4)'; }}>
                  Register Institution <ArrowRight size={18} />
                </button>
                <button onClick={() => navigate('/verify')}
                  style={{ padding: '16px 32px', borderRadius: '14px', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontWeight: 700, fontSize: '16px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.25s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}>
                  <FileSearch size={18} /> Try Free Verification
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{ padding: '60px 0 32px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '48px', marginBottom: '48px' }} className="footer-grid">
            {/* Brand */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', padding: '9px', borderRadius: '11px', boxShadow: '0 0 20px rgba(59,130,246,0.3)' }}>
                  <ShieldCheck size={20} color="#fff" />
                </div>
                <span style={{ fontWeight: 800, fontSize: '18px', color: '#f8fafc', letterSpacing: '-0.02em' }}>CertifyChain</span>
              </div>
              <p style={{ color: '#475569', fontSize: '14px', lineHeight: 1.8, maxWidth: '320px', marginBottom: '24px' }}>
                The leading decentralized credential verification network. Building trust through cryptography since 2024.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                {/* eslint-disable-next-line no-unused-vars */}
                {[{ Icon: Twitter, label: 'Twitter' }, { Icon: Github, label: 'GitHub' }, { Icon: Linkedin, label: 'LinkedIn' }].map(({ Icon, label }) => (
                  <a key={label} href="#" aria-label={label}
                    style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'all 0.2s', textDecoration: 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.15)'; e.currentTarget.style.color = '#60a5fa'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}>
                    <Icon size={17} />
                  </a>
                ))}
              </div>
            </div>

            {/* Links */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px' }}>Platform</h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: 'Verify Certificate', action: () => navigate('/verify') },
                  { label: 'Admin Login', action: () => navigate('/login') },
                  { label: 'Register Institution', action: () => navigate('/signup') },
                  { label: 'Student Portal', action: () => navigate('/signup') },
                ].map(item => (
                  <li key={item.label}>
                    <button onClick={item.action}
                      style={{ background: 'none', border: 'none', color: '#475569', fontSize: '14px', cursor: 'pointer', padding: 0, transition: 'color 0.2s', fontFamily: 'inherit' }}
                      onMouseEnter={e => e.target.style.color = '#94a3b8'}
                      onMouseLeave={e => e.target.style.color = '#475569'}>
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px' }}>Contact</h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {['contact@certifychain.app', 'support@certifychain.app'].map(email => (
                  <li key={email}>
                    <a href={`mailto:${email}`} style={{ color: '#475569', fontSize: '14px', textDecoration: 'none', transition: 'color 0.2s' }}
                      onMouseEnter={e => e.target.style.color = '#94a3b8'}
                      onMouseLeave={e => e.target.style.color = '#475569'}>
                      {email}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ paddingTop: '28px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <p style={{ color: '#334155', fontSize: '13px' }}>© {new Date().getFullYear()} CertifyChain. All rights reserved.</p>
            <div style={{ display: 'flex', gap: '24px' }}>
              {['Privacy Policy', 'Terms of Service'].map(item => (
                <a key={item} href="#" style={{ color: '#334155', fontSize: '13px', textDecoration: 'none', transition: 'color 0.2s' }}
                  onMouseEnter={e => e.target.style.color = '#64748b'}
                  onMouseLeave={e => e.target.style.color = '#334155'}>
                  {item}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* ── Responsive Styles ─────────────────────────────────────────────── */}
      <style>{`
        @media (max-width: 900px) {
          .hero-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
          .hero-card { display: none !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .workflow-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 32px !important; }
          .footer-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .workflow-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 767px) {
          nav .hidden.sm\\:block { display: none !important; }
          nav .md\\:flex { display: none !important; }
          nav .md\\:hidden { display: block !important; }
        }
      `}</style>
    </div>
  );
}
