import React from 'react';

export default function RegionalAdminDashboard({
  user,
  activeOutlet,
  lowStockCount,
  criticalExpiries,
  warningExpiries,
  scanning,
  scanResult,
  handleTriggerScan,
  expiryAlerts,
  trendData,
  points,
  areaPath,
  linePath,
  maxAmount
}) {
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>
            System Command Center
            <span className="premium-badge" style={{
              marginLeft: '12px',
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              background: 'rgba(99, 102, 241, 0.15)',
              color: 'var(--primary)',
              border: '1px solid currentColor'
            }}>
              🔑 Regional Admin
            </span>
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Welcome back, <strong style={{ color: 'var(--text-primary)' }}>{user?.username}</strong> • Regional Scope: Delhi NCR
          </p>
        </div>
        
        <button
          onClick={handleTriggerScan}
          disabled={scanning}
          className="premium-btn premium-btn-primary animate-pulse-glow"
          style={{
            fontSize: '0.85rem',
            padding: '10px 20px',
            background: 'linear-gradient(135deg, var(--primary), var(--accent-teal))'
          }}
        >
          {scanning ? 'Scanning Batches...' : '⚡ Run Expiry Scan'}
        </button>
      </div>

      {scanResult && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          color: 'var(--success)',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '0.85rem'
        }}>
          {scanResult}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px'
      }}>
        <div className="glass-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>⚠️</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Low-Stock Warnings
          </span>
          <h1 className="glow-text-teal" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--accent-teal)' }}>
            {lowStockCount}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Items below set reorder points
          </p>
        </div>

        <div className="glass-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>🚨</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Urgent Expiries (≤ 30d)
          </span>
          <h1 className="glow-text-critical" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--critical)' }}>
            {criticalExpiries.length}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Active batches requiring removal
          </p>
        </div>

        <div className="glass-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>⏳</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Expiry Warnings (≤ 90d)
          </span>
          <h1 className="glow-text-success" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--warning)' }}>
            {warningExpiries.length}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Batches expiring soon
          </p>
        </div>

        <div className="glass-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>🏢</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Active Outlets
          </span>
          <h1 className="glow-text-primary" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--primary)' }}>
            180
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Stores linked across region
          </p>
        </div>
      </div>

      {/* Revenue Performance Chart */}
      <div className="glass-card animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0 }}>📈 Real-time Regional Revenue</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Live consolidated sales performance across active pharmacy registers
            </p>
          </div>
          <span className="premium-badge badge-success animate-pulse-glow" style={{ fontSize: '0.75rem' }}>● Live Feed</span>
        </div>
        
        <div style={{ position: 'relative', padding: '10px 0' }}>
          <svg width="100%" height="200" viewBox="0 0 600 200" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--primary)" />
                <stop offset="100%" stopColor="var(--accent-teal)" />
              </linearGradient>
            </defs>
            
            <line x1="50" y1="20" x2="580" y2="20" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
            <line x1="50" y1="90" x2="580" y2="90" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
            <line x1="50" y1="160" x2="580" y2="160" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
            
            <path d={areaPath} fill="url(#areaGradient)" />
            <path d={linePath} fill="none" stroke="url(#lineGradient)" strokeWidth="3" strokeLinecap="round" />
            
            {points.map((p, i) => (
              <g key={i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="5"
                  fill="var(--bg-deep)"
                  stroke={i === points.length - 1 ? 'var(--accent-teal)' : 'var(--primary)'}
                  strokeWidth="3"
                />
                <text
                  x={p.x}
                  y={p.y - 12}
                  textAnchor="middle"
                  fontSize="10px"
                  fill="var(--text-primary)"
                  fontWeight="600"
                >
                  ₹{p.amount.toFixed(0)}
                </text>
              </g>
            ))}
            
            {points.map((p, i) => (
              <text
                key={i}
                x={p.x}
                y="180"
                textAnchor="middle"
                fontSize="10px"
                fill="var(--text-secondary)"
              >
                {p.day}
              </text>
            ))}
          </svg>
        </div>
      </div>

      {/* Analytics Visualizations */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '24px',
        alignItems: 'stretch'
      }}>
        {/* Donut Chart */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3>Expiry Risk Distribution</h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            padding: '16px 0'
          }}>
            <svg width="150" height="150" viewBox="0 0 36 36">
              <path
                className="ring-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="3.5"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="var(--success)"
                strokeWidth="3.5"
                strokeDasharray="70, 100"
                strokeDashoffset="0"
                style={{ filter: 'drop-shadow(0 0 2px var(--success-glow))' }}
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="var(--warning)"
                strokeWidth="3.5"
                strokeDasharray="20, 100"
                strokeDashoffset="-70"
                style={{ filter: 'drop-shadow(0 0 2px var(--warning-glow))' }}
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="var(--critical)"
                strokeWidth="3.5"
                strokeDasharray="10, 100"
                strokeDashoffset="-90"
                style={{ filter: 'drop-shadow(0 0 2px var(--critical-glow))' }}
              />
              <text x="18" y="20.5" textAnchor="middle" fontSize="6px" fill="white" fontWeight="bold">
                {expiryAlerts.length} total
              </text>
            </svg>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--success)' }}></span>
                <span>Active/Healthy: 70%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--warning)' }}></span>
                <span>Expiry Warn: {warningExpiries.length} batches</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--critical)' }}></span>
                <span>Expiry Urgent: {criticalExpiries.length} batches</span>
              </div>
            </div>
          </div>
        </div>

        {/* Safety Stock levels */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3>Safety stock levels by Category</h3>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%',
            gap: '12px',
            paddingTop: '8px'
          }}>
            {[
              { category: 'Antibiotics', value: 85, color: 'var(--primary)' },
              { category: 'Regulated Class (H/X)', value: 42, color: 'var(--critical)' },
              { category: 'Cardiology', value: 65, color: 'var(--accent-teal)' },
              { category: 'General SKU', value: 92, color: 'var(--success)' }
            ].map((bar, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{bar.category}</span>
                  <span style={{ fontWeight: 600 }}>{bar.value}% Capacity</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${bar.value}%`,
                    height: '100%',
                    background: bar.color,
                    borderRadius: '4px',
                    transition: 'width 1s ease-in-out'
                  }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alert Feed Table */}
      <div className="glass-card">
        <h3 style={{ marginBottom: '16px' }}>Recent Expiry Warnings & Alerts</h3>
        {expiryAlerts.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: '0.9rem' }}>
            No batches expiring within 90 days.
          </p>
        ) : (
          <div className="premium-table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Product SKU</th>
                  <th>Product Name</th>
                  <th>Batch Number</th>
                  <th>Expiry Date</th>
                  <th>Remaining Days</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {expiryAlerts.map((alert, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{alert.sku_code}</td>
                    <td>{alert.product_name}</td>
                    <td>{alert.batch_number}</td>
                    <td>{alert.expiry_date}</td>
                    <td>{alert.days_to_expiry} days</td>
                    <td>
                      <span className={`premium-badge ${alert.alert_type === 'urgent' ? 'badge-danger' : 'badge-warning'}`}>
                        {alert.alert_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
