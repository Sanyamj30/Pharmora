import React from 'react';

export default function Sidebar({ activeView, setActiveView, user, onLogout, mobileOpen, setMobileOpen }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', roles: ['regional_admin', 'pharmacist', 'inventory_controller', 'finance_manager'] },
    { id: 'inventory', label: 'Inventory', icon: '📦', roles: ['regional_admin', 'inventory_controller'] },
    { id: 'sales', label: 'Sales POS', icon: '💳', roles: ['regional_admin', 'pharmacist'] },
    { id: 'prescriptions', label: 'Prescriptions', icon: '💊', roles: ['regional_admin', 'pharmacist'] }
  ].filter(tab => tab.roles.includes(user?.role || 'regional_admin'));

  const handleNavClick = (id) => {
    setActiveView(id);
    if (setMobileOpen) setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="sidebar-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 998
          }}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`app-sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        style={{
          width: '250px',
          minWidth: '250px',
          height: '100vh',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border-sidebar)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '24px 16px',
          zIndex: 999,
          userSelect: 'none',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {/* Top Section */}
        <div>
          {/* Brand Logo & Mobile Close */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px 24px 8px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, var(--accent-gold), #d97706)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#000000',
                fontWeight: 800,
                fontSize: '1rem',
                boxShadow: '0 4px 12px var(--primary-glow)'
              }}>
                P
              </div>
              <div>
                <span style={{
                  fontWeight: 800,
                  fontSize: '1.25rem',
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                  display: 'block',
                  lineHeight: 1
                }}>Pharmora</span>
                <span style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-sidebar)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600
                }}>Enterprise Cloud</span>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={() => setMobileOpen(false)}
              className="mobile-close-btn"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                fontSize: '1.2rem',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              ✕
            </button>
          </div>

          {/* Navigation Group Header */}
          <div style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: 'var(--text-sidebar)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '0 8px 12px 8px'
          }}>
            Data Management
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    borderLeft: isActive ? '4px solid var(--accent-gold)' : '4px solid transparent',
                    background: isActive ? 'var(--bg-sidebar-active)' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--text-sidebar)',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  <span style={{ fontSize: '1.1rem', opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section - User Info & Logout */}
        <div style={{
          paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'var(--accent-gold)',
                color: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.85rem'
              }}>
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {user?.username || 'User'}
                </div>
                <div style={{
                  color: 'var(--text-sidebar)',
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  fontWeight: 600
                }}>
                  {user?.role?.replace('_', ' ')}
                </div>
              </div>
            </div>

            <button
              onClick={onLogout}
              title="Logout"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-sidebar)',
                cursor: 'pointer',
                fontSize: '1rem',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.color = '#ef4444'}
              onMouseLeave={(e) => e.target.style.color = 'var(--text-sidebar)'}
            >
              🚪
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
