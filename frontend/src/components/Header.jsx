import React, { useState } from 'react';

export default function Header({ activeView, activeOutlet, setActiveOutlet, user, alerts }) {
  const [showNotifications, setShowNotifications] = useState(false);

  const viewTitles = {
    dashboard: { title: 'Operational Overview', subtitle: 'Real-time telemetry, audit stats, and quick actions' },
    inventory: { title: 'Inventory Control & Batches', subtitle: 'Track stock levels, FEFO expiration audits, and product catalog' },
    sales: { title: 'Sales & POS Terminal', subtitle: 'Process compliant customer checkouts and active invoices' },
    prescriptions: { title: 'Prescriptions & Compliance', subtitle: 'Validate medical prescriptions and dosage authorizations' }
  };

  const currentMeta = viewTitles[activeView] || { title: 'Dashboard', subtitle: 'Manage your pharmacy operations' };
  const outletScope = user?.outlet_scope || [];

  return (
    <header style={{
      background: '#ffffff',
      borderBottom: '1px solid var(--border-color)',
      padding: '16px 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)'
    }}>
      {/* Title & Subtitle */}
      <div>
        <h1 style={{
          fontSize: '1.4rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
          margin: 0
        }}>
          {currentMeta.title}
        </h1>
        <p style={{
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          margin: '2px 0 0 0'
        }}>
          {currentMeta.subtitle}
        </p>
      </div>

      {/* Controls & Alerts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Outlet Scope Selector */}
        {outletScope.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Outlet:
            </span>
            <select
              value={activeOutlet}
              onChange={(e) => setActiveOutlet(e.target.value)}
              className="premium-input"
              style={{
                padding: '6px 12px',
                width: 'auto',
                fontSize: '0.85rem',
                background: '#f8fafc',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
                minWidth: '160px',
                borderRadius: '8px'
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
            style={{
              background: '#f8fafc',
              border: '1px solid var(--border-color)',
              padding: '8px 12px',
              borderRadius: '8px',
              color: alerts.length > 0 ? 'var(--warning)' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              fontWeight: 600
            }}
          >
            🔔
            {alerts.length > 0 && (
              <span style={{
                background: 'var(--critical)',
                color: 'white',
                fontSize: '0.7rem',
                fontWeight: 700,
                borderRadius: '999px',
                padding: '1px 6px'
              }}>
                {alerts.length}
              </span>
            )}
          </button>

          {showNotifications && (
            <div style={{
              position: 'absolute',
              top: '45px',
              right: 0,
              width: '320px',
              maxHeight: '400px',
              overflowY: 'auto',
              padding: '16px',
              background: '#ffffff',
              border: '1px solid var(--border-color)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
              borderRadius: '12px',
              zIndex: 1000
            }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', color: 'var(--text-primary)' }}>
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
                      <div style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)' }}>
                        <span>{alert.sku_code || 'SKU'}</span>
                        <span style={{ color: alert.alert_type === 'urgent' ? 'var(--critical)' : 'var(--warning)', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                          {alert.alert_type}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {alert.product_name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
