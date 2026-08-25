import React, { useState } from 'react';
import { api } from '../services/api';

export default function LoginView({ onLoginSuccess, onBackClick }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const claims = await api.login(username, password);
      onLoginSuccess(claims);
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '24px',
      background: 'var(--bg-deep)'
    }}>
      <div className="glass-card animate-fade-in" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '36px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08)',
        position: 'relative',
        background: '#ffffff',
        border: '1px solid var(--border-color)',
        borderRadius: '16px'
      }}>
        <div>
          {onBackClick && (
            <button
              onClick={onBackClick}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '20px',
                padding: '0',
                fontWeight: 600,
                transition: 'var(--transition-smooth)'
              }}
              onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
            >
              ← Back to Homepage
            </button>
          )}

          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              display: 'inline-flex',
              padding: '12px',
              borderRadius: '12px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              marginBottom: '14px'
            }}>
              <span style={{ fontSize: '1.8rem' }}>🔐</span>
            </div>
            <h2 style={{ fontSize: '1.6rem', marginBottom: '6px', fontWeight: 800, color: '#0f172a' }}>
              Pharmora
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
              Operational Microservices Portal Login
            </p>
          </div>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#dc2626',
              fontSize: '0.82rem',
              marginBottom: '18px',
              lineHeight: 1.4,
              fontWeight: 500
            }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="premium-input-container">
              <label className="premium-label">Username</label>
              <input
                type="text"
                className="premium-input"
                placeholder="e.g. admin_delhi"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="premium-input-container">
              <label className="premium-label">Password</label>
              <input
                type="password"
                className="premium-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="premium-btn premium-btn-primary"
              style={{ width: '100%', marginTop: '6px', padding: '12px' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          {/* Quick Demo Login Credentials Buttons */}
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              💡 Demo Accounts (1-Click Fill)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button 
                type="button"
                onClick={() => { setUsername('pharmacist'); setPassword('pharmacistpassword'); setError(''); }}
                style={{ padding: '8px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', cursor: 'pointer', fontWeight: 600 }}
              >
                Pharmacist
              </button>
              <button 
                type="button"
                onClick={() => { setUsername('admin'); setPassword('adminpassword'); setError(''); }}
                style={{ padding: '8px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', cursor: 'pointer', fontWeight: 600 }}
              >
                Admin
              </button>
              <button 
                type="button"
                onClick={() => { setUsername('inventory'); setPassword('inventorypassword'); setError(''); }}
                style={{ padding: '8px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', cursor: 'pointer', fontWeight: 600 }}
              >
                Inventory
              </button>
              <button 
                type="button"
                onClick={() => { setUsername('finance'); setPassword('financepassword'); setError(''); }}
                style={{ padding: '8px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', cursor: 'pointer', fontWeight: 600 }}
              >
                Finance
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
