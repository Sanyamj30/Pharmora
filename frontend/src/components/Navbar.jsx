import React, { useState } from 'react';
import { clearAuth } from '../services/api';

export default function Navbar({ activeView, setActiveView, user, activeOutlet, setActiveOutlet, alerts, onLogout }) {
  const [showNotifications, setShowNotifications] = useState(false);

  const outletScope = user?.outlet_scope || [];
  
  return (
    <nav className="glass-card" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 24px',
      borderRadius: '0 0 16px 16px',
      borderTop: 'none',
      marginBottom: '24px',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Brand Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: 'var(--accent-teal)',
          boxShadow: '0 0 10px var(--accent-teal)'
        }}></div>
        <span style={{
          fontWeight: 800,
          fontSize: '1.25rem',
          letterSpacing: '-0.03em',
          background: 'linear-gradient(90deg, #f8fafc, var(--accent-teal))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>Pharmora</span>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {[
          { id: 'dashboard', label: 'Dashboard', roles: ['regional_admin', 'pharmacist', 'inventory_controller', 'finance_manager'] },
          { id: 'inventory', label: 'Inventory', roles: ['regional_admin', 'inventory_controller'] },
          { id: 'sales', label: 'Sales POS', roles: ['regional_admin', 'pharmacist'] }
        ].filter(tab => tab.roles.includes(user?.role || 'regional_admin')).map((tab) => {
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className="premium-btn"
              style={{
                background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: '1px solid',
                borderColor: isActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                padding: '8px 16px',
                fontSize: '0.9rem',
                borderRadius: '8px'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Action / Context Area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Outlet Scope Selector */}
        {outletScope.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Outlet:</span>
            <select
              value={activeOutlet}
              onChange={(e) => setActiveOutlet(e.target.value)}
              className="premium-input"
              style={{
                padding: '6px 12px',
                width: 'auto',
                fontSize: '0.85rem',
                background: 'rgba(15, 23, 42, 0.9)',
                minWidth: '150px'
              }}
            >
              {outletScope.map((id) => (
                <option key={id} value={id}>
                  {id.substring(0, 8)}... (Active)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Notification Bell */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="premium-btn"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-glow)',
              padding: '8px',
              borderRadius: '8px',
              color: alerts.length > 0 ? 'var(--warning)' : 'var(--text-secondary)'
            }}
          >
            🔔
            {alerts.length > 0 && (
              <span style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                background: 'var(--critical)',
                color: 'white',
                fontSize: '0.65rem',
                fontWeight: 'bold',
                borderRadius: '50%',
                width: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 8px var(--critical)'
              }}>
                {alerts.length}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="glass-card animate-fade-in" style={{
              position: 'absolute',
              top: '45px',
              right: 0,
              width: '320px',
              maxHeight: '400px',
              overflowY: 'auto',
              padding: '16px',
              background: 'rgba(11, 15, 25, 0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              borderRadius: '12px'
            }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', borderBottom: '1px solid var(--border-glow)', paddingBottom: '8px' }}>
                Active System Alerts
              </h4>
              {alerts.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                  No warnings or low-stock items detected.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {alerts.map((alert, idx) => (
                    <div key={idx} style={{
                      padding: '10px',
                      background: alert.alert_type === 'urgent' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                      borderLeft: `3px solid ${alert.alert_type === 'urgent' ? 'var(--critical)' : 'var(--warning)'}`,
                      borderRadius: '4px',
                      fontSize: '0.8rem'
                    }}>
                      <div style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{alert.sku_code || 'SKU'}</span>
                        <span style={{ color: alert.alert_type === 'urgent' ? 'var(--critical)' : 'var(--warning)', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                          {alert.alert_type}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {alert.product_name}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                        {alert.days_to_expiry !== undefined 
                          ? `Expires in ${alert.days_to_expiry} days` 
                          : `Stock level critical: ${alert.current_quantity} remaining`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.username || 'Pharmacist'}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              {user?.role?.replace('_', ' ')}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="premium-btn premium-btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              borderRadius: '8px'
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
