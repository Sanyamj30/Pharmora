import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

export default function PharmacistDashboard({
  user,
  activeOutlet,
  sessionSalesTotal,
  points,
  areaPath,
  linePath,
  trendData
}) {
  const [totalProducts, setTotalProducts] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadDashboardData = async () => {
    if (!activeOutlet) return;
    setLoading(true);
    try {
      const stock = await api.listStock(activeOutlet);
      setTotalProducts(stock.length);
      const lowStock = stock.filter(item => item.total_quantity <= (item.product?.reorder_point || 20));
      setLowStockCount(lowStock.length);
    } catch (err) {
      console.error('Failed to load dashboard telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [activeOutlet]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>
            Pharmacist Sales Terminal
            <span className="premium-badge" style={{
              marginLeft: '12px',
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              background: 'rgba(16, 185, 129, 0.15)',
              color: 'var(--success)',
              border: '1px solid currentColor'
            }}>
              ⚕️ Active Cashier Session
            </span>
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Logged in: <strong style={{ color: 'var(--text-primary)' }}>{user?.username}</strong> • Outlet Direct Sales Terminal
          </p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '20px'
      }}>
        <div className="glass-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>💰</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            POS Register Session
          </span>
          <h1 className="glow-text-success" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--success)' }}>
            ₹{(185.0 + sessionSalesTotal).toFixed(2)}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Billing total for current register drawer
          </p>
        </div>

        <div className="glass-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>📦</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Active Medicine SKUs
          </span>
          <h1 className="glow-text-teal" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--accent-teal)' }}>
            {totalProducts}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Products available in current outlet
          </p>
        </div>

        <div className="glass-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>⚠️</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Low Stock Alerts
          </span>
          <h1 className="glow-text-critical" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--critical)' }}>
            {lowStockCount}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Products near or below reorder threshold
          </p>
        </div>
      </div>

      {/* Hourly Sales Trend Chart */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0 }}>📈 Real-time POS Session Sales</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Live billing register sales performance tracking for the current cashier session
            </p>
          </div>
          <span className="premium-badge badge-success animate-pulse-glow" style={{ fontSize: '0.75rem' }}>● Live Feed</span>
        </div>
        
        <div style={{ position: 'relative', padding: '10px 0' }}>
          <svg width="100%" height="200" viewBox="0 0 600 200" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
            <path d={areaPath} fill="url(#areaGradient)" />
            <path d={linePath} fill="none" stroke="url(#lineGradient)" strokeWidth="3" strokeLinecap="round" />
            
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="5" fill="var(--bg-deep)" stroke="var(--primary)" strokeWidth="3" />
                <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="10px" fill="var(--text-primary)" fontWeight="600">
                  ₹{p.amount.toFixed(0)}
                </text>
              </g>
            ))}
            
            {points.map((p, i) => (
              <text key={i} x={p.x} y="180" textAnchor="middle" fontSize="10px" fill="var(--text-secondary)">
                {p.day}
              </text>
            ))}
          </svg>
        </div>
      </div>

    </div>
  );
}
