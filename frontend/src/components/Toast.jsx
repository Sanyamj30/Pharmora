import React, { useState, useEffect, createContext, useContext } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto remove after 4 seconds
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    warning: (msg) => addToast(msg, 'warning'),
    info: (msg) => addToast(msg, 'info')
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast Container Overlay */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '380px',
        width: 'calc(100% - 40px)',
        pointerEvents: 'none'
      }}>
        {toasts.map((t) => {
          const typeStyles = {
            success: { bg: '#ecfdf5', border: '#a7f3d0', color: '#047857', icon: '✅' },
            error: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', icon: '⚠️' },
            warning: { bg: '#fffbeb', border: '#fde68a', color: '#b45309', icon: '🔔' },
            info: { bg: '#f0f9ff', border: '#bae6fd', color: '#0369a1', icon: 'ℹ️' }
          }[t.type] || { bg: '#ffffff', border: '#e2e8f0', color: '#0f172a', icon: '💬' };

          return (
            <div
              key={t.id}
              className="animate-fade-in"
              style={{
                pointerEvents: 'auto',
                background: typeStyles.bg,
                border: `1px solid ${typeStyles.border}`,
                color: typeStyles.color,
                padding: '12px 16px',
                borderRadius: '10px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '0.88rem',
                fontWeight: 600,
                lineHeight: 1.4
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1rem' }}>{typeStyles.icon}</span>
                <span>{t.message}</span>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: typeStyles.color,
                  cursor: 'pointer',
                  fontSize: '1rem',
                  padding: '2px 4px',
                  opacity: 0.7
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      success: (msg) => console.log('Toast success:', msg),
      error: (msg) => console.log('Toast error:', msg),
      warning: (msg) => console.log('Toast warning:', msg),
      info: (msg) => console.log('Toast info:', msg)
    };
  }
  return context;
}
