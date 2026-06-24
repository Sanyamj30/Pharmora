import React, { useState, useEffect } from 'react';
import heroMockup from '../assets/hero-mockup.png';

export default function LandingView({ onLoginClick }) {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);

  // Live Gateway Telemetry Checks
  const [gatewayStatus, setGatewayStatus] = useState('Checking...');
  const [latency, setLatency] = useState(null);

  useEffect(() => {
    const checkGateway = async () => {
      const startTime = performance.now();
      try {
        // Query the local gateway's openapi schema. This bypasses auth and returns CORS headers.
        const res = await fetch('http://localhost:8000/openapi.json', { 
          method: 'GET', 
          mode: 'cors' 
        });
        if (res.ok) {
          const endTime = performance.now();
          setLatency(Math.round(endTime - startTime));
          setGatewayStatus('Live');
        } else {
          setGatewayStatus('Offline');
          setLatency(null);
        }
      } catch (err) {
        setGatewayStatus('Offline');
        setLatency(null);
      }
    };

    checkGateway();
    const interval = setInterval(checkGateway, 3000); // refresh telemetry every 3s
    return () => clearInterval(interval);
  }, []);

  const handleContactSubmit = (e) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMessage) return;

    // Generate mailto link parameters
    const subject = encodeURIComponent(`Pharmora Inquiry from ${contactName}`);
    const body = encodeURIComponent(
      `Hello Sanyam,\n\nYou have received a new operational inquiry through the Pharmora Landing Page:\n\n` +
      `-----------------------------------------\n` +
      `Name: ${contactName}\n` +
      `Email: ${contactEmail}\n` +
      `-----------------------------------------\n\n` +
      `Message Details:\n${contactMessage}\n\n` +
      `Regards,\nPharmora Gateway Portal`
    );

    // Trigger user mail client
    window.location.href = `mailto:sanyam30jpr@gmail.com?subject=${subject}&body=${body}`;

    setFormSubmitted(true);
    setTimeout(() => {
      setFormSubmitted(false);
      setContactName('');
      setContactEmail('');
      setContactMessage('');
    }, 5000);
  };

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div style={{ 
      color: 'var(--text-primary)', 
      fontFamily: 'var(--font-primary)',
      backgroundColor: 'transparent',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Sticky Header Navigation */}
      <nav className="glass-card" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 36px',
        borderRadius: '0 0 20px 20px',
        borderTop: 'none',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(12, 17, 30, 0.85)',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.4)',
        margin: '0 auto 24px auto',
        width: '100%',
        maxWidth: '1440px'
      }}>
        {/* Brand/Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: 'var(--accent-teal)',
            boxShadow: '0 0 12px var(--accent-teal)'
          }}></div>
          <span style={{
            fontWeight: 800,
            fontSize: '1.45rem',
            letterSpacing: '-0.03em',
            background: 'linear-gradient(90deg, #f8fafc, var(--accent-teal))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>Pharmora</span>
        </div>

        {/* Links */}
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <button 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} 
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, transition: 'var(--transition-smooth)' }}
          >
            Home
          </button>
          <button 
            onClick={() => scrollToSection('features')} 
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, transition: 'var(--transition-smooth)' }} 
            onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'} 
            onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
          >
            Features
          </button>
          <button 
            onClick={() => scrollToSection('about')} 
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, transition: 'var(--transition-smooth)' }} 
            onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'} 
            onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
          >
            About Us
          </button>
          <button 
            onClick={() => scrollToSection('contact')} 
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, transition: 'var(--transition-smooth)' }} 
            onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'} 
            onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
          >
            Contact
          </button>
        </div>

        {/* Action Button */}
        <div>
          <button 
            onClick={onLoginClick}
            className="premium-btn premium-btn-primary animate-pulse-glow"
            style={{ padding: '10px 24px', fontSize: '0.9rem', borderRadius: '8px' }}
          >
            Sign In 🔑
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        maxWidth: '1440px',
        width: '100%',
        margin: '50px auto 70px auto',
        padding: '0 32px',
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        gap: '64px',
        alignItems: 'center'
      }}>
        {/* Left Column: Value Proposition */}
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div style={{ display: 'inline-flex', alignSelf: 'flex-start' }}>
            <span className="premium-badge badge-info" style={{ fontSize: '0.8rem', padding: '6px 14px', borderRadius: '20px' }}>
              🛡️ Enterprise Compliance Platform
            </span>
          </div>
          <h1 style={{ 
            fontSize: '3.6rem', 
            lineHeight: '1.15', 
            fontWeight: 800,
            background: 'linear-gradient(135deg, #ffffff 60%, var(--primary) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Secure & Real-time <br />
            <span className="glow-text-primary" style={{ color: 'var(--primary)' }}>Pharmacy Operations</span>
          </h1>
          <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', maxWidth: '600px', lineHeight: '1.7' }}>
            Pharmora orchestrates retail pharmacy workflows across 180+ outlets and 12 state distribution hubs. Fully integrated with automated FEFO batch allocation, medical prescription verification, and zero-loss stock transfer enforcement.
          </p>
          <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
            <button onClick={onLoginClick} className="premium-btn premium-btn-primary" style={{ padding: '14px 30px', fontSize: '1rem', borderRadius: '8px' }}>
              Access Operational Portal
            </button>
            <button onClick={() => scrollToSection('features')} className="premium-btn premium-btn-secondary" style={{ padding: '14px 30px', fontSize: '1rem', borderRadius: '8px' }}>
              Explore Features
            </button>
          </div>
        </div>

        {/* Right Column: Interactive Mockup / Illustration */}
        <div className="animate-fade-in" style={{ position: 'relative' }}>
          {/* Neon Glow Backdrop */}
          <div style={{
            position: 'absolute',
            top: '-20px',
            left: '-20px',
            right: '-20px',
            bottom: '-20px',
            borderRadius: '24px',
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
            filter: 'blur(30px)',
            zIndex: 0
          }}></div>

          <div className="glass-card" style={{ 
            position: 'relative', 
            zIndex: 1, 
            padding: '12px', 
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
          }}>
            <img 
              src={heroMockup} 
              alt="Pharmora Dashboard Preview" 
              style={{
                width: '100%',
                borderRadius: '12px',
                display: 'block',
                border: '1px solid rgba(255,255,255,0.05)'
              }} 
            />
            {/* Overlay Telemetry Badge */}
            <div style={{
              position: 'absolute',
              bottom: '24px',
              right: '24px',
              background: 'rgba(6, 9, 19, 0.85)',
              border: `1px solid ${gatewayStatus === 'Live' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: '8px',
              padding: '10px 16px',
              backdropFilter: 'blur(8px)',
              transition: 'var(--transition-smooth)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  background: gatewayStatus === 'Live' ? 'var(--success)' : (gatewayStatus === 'Offline' ? 'var(--critical)' : 'var(--warning)'), 
                  boxShadow: `0 0 8px ${gatewayStatus === 'Live' ? 'var(--success)' : (gatewayStatus === 'Offline' ? 'var(--critical)' : 'var(--warning)')}`, 
                  display: 'inline-block',
                  transition: 'var(--transition-smooth)'
                }}></span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  API Gateway: {gatewayStatus}
                </span>
              </div>
              {gatewayStatus === 'Live' && latency !== null && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Latency: {latency}ms
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stats Counter Row */}
      <section style={{
        background: 'rgba(12, 17, 30, 0.4)',
        borderTop: '1px solid var(--border-glow)',
        borderBottom: '1px solid var(--border-glow)',
        padding: '40px 0',
        marginBottom: '70px'
      }}>
        <div style={{
          maxWidth: '1440px',
          margin: '0 auto',
          padding: '0 32px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '24px',
          textAlign: 'center'
        }}>
          <div>
            <div style={{ fontSize: '2.8rem', fontWeight: 800, color: 'var(--accent-teal)', textShadow: '0 0 15px rgba(14, 165, 233, 0.2)' }}>180+</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Outlets Connected</div>
          </div>
          <div>
            <div style={{ fontSize: '2.8rem', fontWeight: 800, color: 'var(--primary)', textShadow: '0 0 15px rgba(99, 102, 241, 0.2)' }}>12</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Distribution Hubs</div>
          </div>
          <div>
            <div style={{ fontSize: '2.8rem', fontWeight: 800, color: 'var(--success)', textShadow: '0 0 15px rgba(16, 185, 129, 0.2)' }}>&lt; 200ms</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Checkout Latency</div>
          </div>
          <div>
            <div style={{ fontSize: '2.8rem', fontWeight: 800, color: 'var(--warning)', textShadow: '0 0 15px rgba(245, 158, 11, 0.2)' }}>100%</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>FEFO Compliance</div>
          </div>
        </div>
      </section>

      {/* Features Grid Section */}
      <section id="features" style={{
        maxWidth: '1440px',
        width: '100%',
        margin: '0 auto 90px auto',
        padding: '0 32px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <h2 style={{ fontSize: '2.5rem', marginBottom: '14px', fontWeight: 700 }}>Operational Core Capabilities</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto', fontSize: '1.05rem', lineHeight: '1.6' }}>
            Built specifically to solve compliance and scale challenges across modern healthcare retail distribution.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '28px'
        }}>
          {/* Card 1: Prescription Checkouts */}
          <div className="glass-card" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '20px', 
            height: '100%', 
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '28px'
          }}>
            <div style={{
              display: 'inline-flex',
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(14, 165, 233, 0.1)',
              alignSelf: 'flex-start'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <h3 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', fontWeight: 600 }}>Prescription Validation</h3>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', flexGrow: 1, lineHeight: '1.6' }}>
              Enforces real-time validation of doctor prescriptions, checks quantity thresholds, and logs clinical overrides to guarantee GxP regulatory compliance.
            </p>
          </div>

          {/* Card 2: FEFO Batching */}
          <div className="glass-card" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '20px', 
            height: '100%', 
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '28px'
          }}>
            <div style={{
              display: 'inline-flex',
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.1)',
              alignSelf: 'flex-start'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <h3 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', fontWeight: 600 }}>FEFO Batch Allocation</h3>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', flexGrow: 1, lineHeight: '1.6' }}>
              Automated First-Expiry, First-Out batch selection. Instantly prioritizes older batches, preventing inventory waste and expiration-related checkout blocks.
            </p>
          </div>

          {/* Card 3: Stock Conservation */}
          <div className="glass-card" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '20px', 
            height: '100%', 
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '28px'
          }}>
            <div style={{
              display: 'inline-flex',
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.1)',
              alignSelf: 'flex-start'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2.1l4 4-4 4"></path><path d="M3 12.2v-2a4 4 0 0 1 4-4h14"></path><path d="M7 21.9l-4-4 4-4"></path><path d="M21 11.8v2a4 4 0 0 1-4 4H3"></path></svg>
            </div>
            <h3 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', fontWeight: 600 }}>Stock Conservation</h3>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', flexGrow: 1, lineHeight: '1.6' }}>
              Enforces transactional integrity on stock transfers. Guarantees quantities are reserved at the source and received at the destination without duplication.
            </p>
          </div>

          {/* Card 4: Conversational BI */}
          <div className="glass-card" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '20px', 
            height: '100%', 
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '28px'
          }}>
            <div style={{
              display: 'inline-flex',
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.1)',
              alignSelf: 'flex-start'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <h3 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', fontWeight: 600 }}>Conversational BI</h3>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', flexGrow: 1, lineHeight: '1.6' }}>
              Finance managers can query sales margins and metrics in natural language. Powered by secure row-level security constraints matching user scope.
            </p>
          </div>
        </div>
      </section>

      {/* About Us Section */}
      <section id="about" style={{
        borderTop: '1px solid var(--border-glow)',
        background: 'rgba(12, 17, 30, 0.2)',
        padding: '90px 0'
      }}>
        <div style={{
          maxWidth: '1440px',
          margin: '0 auto',
          padding: '0 32px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '72px',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '24px', fontWeight: 700 }}>Our Mission & Business Case</h2>
            <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: '1.7' }}>
              Pharmora was established to address the critical gaps in multi-branch pharmacy retail networks. Operating a pharmaceutical business requires adherence to strict compliance mandates, where mistakes can lead to heavy regulatory penalties or patient safety hazards.
            </p>
            <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: '1.7' }}>
              By implementing an async microservices architecture backed by Kafka, Redis, and high-performance databases, Pharmora provides real-time consistency. This ensures pharmacists can check out sales securely within milliseconds while regional admins audit and coordinate logistics.
            </p>
            <div style={{
              display: 'flex',
              gap: '12px',
              marginTop: '32px'
            }}>
              <span className="premium-badge badge-success" style={{ padding: '6px 14px', borderRadius: '20px' }}>✓ 100% Audit Logs</span>
              <span className="premium-badge badge-success" style={{ padding: '6px 14px', borderRadius: '20px' }}>✓ Zero-Loss Transfers</span>
              <span className="premium-badge badge-success" style={{ padding: '6px 14px', borderRadius: '20px' }}>✓ Secure IAM Gateway</span>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '44px', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '20px', background: 'rgba(15, 23, 42, 0.65)' }}>
            <h3 style={{ fontSize: '1.6rem', marginBottom: '24px', color: 'var(--accent-teal)', fontWeight: 600 }}>Compliance Safeguards</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', gap: '18px' }}>
                <span style={{ fontSize: '1.4rem', color: 'var(--accent-teal)' }}>🛡️</span>
                <div>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '6px', fontWeight: 600 }}>Automatic Account Lockout</h4>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>Protects administrative portals by locking user accounts after 5 failed login attempts in 15 minutes.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '18px' }}>
                <span style={{ fontSize: '1.4rem', color: 'var(--accent-teal)' }}>🚫</span>
                <div>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '6px', fontWeight: 600 }}>Expired Drug Intercept</h4>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>The checkout engine automatically rejects any batches approaching expiry dates to ensure patient safety.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '18px' }}>
                <span style={{ fontSize: '1.4rem', color: 'var(--accent-teal)' }}>👁️</span>
                <div>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '6px', fontWeight: 600 }}>Row-Level Security Enforcement</h4>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>Enforces data isolation so that outlet metrics cannot be accessed across unauthorized regional boundaries.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" style={{
        maxWidth: '1440px',
        width: '100%',
        margin: '90px auto',
        padding: '0 32px'
      }}>
        <div className="glass-card" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.2fr',
          gap: '64px',
          padding: '56px',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(12, 17, 30, 0.6)'
        }}>
          <div>
            <h2 style={{ fontSize: '2.25rem', marginBottom: '20px', fontWeight: 700 }}>Connect with our Team</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '1rem', lineHeight: '1.6' }}>
              Interested in onboarding your pharmacy network or requesting a system audit? Leave your details and the system will pre-fill a direct email inquiry for review.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '1rem', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '1.2rem' }}>📧</span>
                <a href="mailto:sanyam30jpr@gmail.com" style={{ color: 'var(--accent-teal)', textDecoration: 'none' }} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
                  sanyam30jpr@gmail.com
                </a>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '1.2rem' }}>📍</span>
                <span>Jaipur, Rajasthan, India</span>
              </div>
            </div>
          </div>

          <div>
            {formSubmitted ? (
              <div className="animate-fade-in" style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid var(--success)',
                borderRadius: '16px',
                padding: '40px',
                textAlign: 'center',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '16px'
              }}>
                <div style={{
                  display: 'inline-flex',
                  padding: '16px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--success)'
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <h3 style={{ color: 'var(--success)', fontSize: '1.4rem', fontWeight: 600 }}>Email Client Triggered</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '360px', lineHeight: '1.5' }}>
                  We have pre-filled the inquiry fields in your mail application. Please review and hit send to deliver it to <strong>sanyam30jpr@gmail.com</strong>.
                </p>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  <div className="premium-input-container">
                    <label className="premium-label">Full Name</label>
                    <input 
                      type="text" 
                      className="premium-input" 
                      placeholder="e.g. John Doe"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="premium-input-container">
                    <label className="premium-label">Email Address</label>
                    <input 
                      type="email" 
                      className="premium-input" 
                      placeholder="e.g. john@hospital.org"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="premium-input-container">
                  <label className="premium-label">Your Inquiry</label>
                  <textarea 
                    className="premium-input" 
                    rows="5" 
                    placeholder="Describe your outlet scale or custom requirements..."
                    style={{ fontFamily: 'var(--font-primary)', resize: 'vertical' }}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    required
                  ></textarea>
                </div>
                <button type="submit" className="premium-btn premium-btn-primary" style={{ padding: '14px', width: '100%', borderRadius: '8px', fontSize: '1rem' }}>
                  Send Inquiry Message
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-glow)',
        padding: '40px 0',
        background: 'var(--bg-deep)',
        marginTop: 'auto'
      }}>
        <div style={{
          maxWidth: '1440px',
          margin: '0 auto',
          padding: '0 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.88rem',
          color: 'var(--text-muted)'
        }}>
          <div>
            © {new Date().getFullYear()} Pharmora Inc. All rights reserved. Enforcing compliance & inventory excellence.
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <span style={{ cursor: 'pointer', transition: 'var(--transition-smooth)' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}>Privacy Policy</span>
            <span style={{ cursor: 'pointer', transition: 'var(--transition-smooth)' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}>Terms of Service</span>
            <span style={{ cursor: 'pointer', transition: 'var(--transition-smooth)' }} onClick={() => scrollToSection('features')} onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'} onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}>Platform Invariants</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
