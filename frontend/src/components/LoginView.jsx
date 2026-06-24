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
      minHeight: '80vh',
      padding: '24px'
    }}>
      <div className="glass-card animate-fade-in" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '40px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow decoration */}
        <div style={{
          position: 'absolute',
          top: '-50px',
          right: '-50px',
          width: '150px',
          height: '150px',
          borderRadius: '50%',
          background: 'rgba(99, 102, 241, 0.15)',
          filter: 'blur(40px)',
          zIndex: 0
        }}></div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          {onBackClick && (
            <button
              onClick={onBackClick}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '24px',
                padding: '0',
                fontWeight: 500,
                transition: 'var(--transition-smooth)'
              }}
              onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
            >
              ← Back to Homepage
            </button>
          )}

          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              display: 'inline-flex',
              padding: '12px',
              borderRadius: '12px',
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              marginBottom: '16px'
            }}>
              <span style={{ fontSize: '2rem' }}>🔐</span>
            </div>
            <h2 className="glow-text-primary" style={{ fontSize: '1.75rem', marginBottom: '8px' }}>
              Pharmora
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Operational Microservices Portal Login
            </p>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              padding: '12px 16px',
              color: 'var(--critical)',
              fontSize: '0.85rem',
              marginBottom: '20px',
              lineHeight: 1.4
            }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
              style={{ width: '100%', marginTop: '8px', padding: '14px' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
