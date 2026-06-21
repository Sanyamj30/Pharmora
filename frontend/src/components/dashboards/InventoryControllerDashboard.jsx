import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

export default function InventoryControllerDashboard({
  user,
  activeOutlet,
  lowStockCount,
  criticalExpiries,
  warningExpiries,
  scanning,
  scanResult,
  handleTriggerScan,
  expiryAlerts,
}) {
  const [recommendations, setRecommendations] = useState([]);
  const [transfers, setTransfers] = useState([
    { id: 'TR-8219', source: 'Gurugram Hub', target: 'Delhi Central', status: 'DISPATCHED', date: 'Today, 10:30 AM', items: 250 },
    { id: 'TR-7301', source: 'Noida Hub', target: 'Delhi Central', status: 'RECEIVED', date: 'Yesterday', items: 100 },
    { id: 'TR-9118', source: 'Delhi Central', target: 'Faridabad Store', status: 'APPROVED', date: 'Today, 2:15 PM', items: 50 }
  ]);

  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchRecommendations = async () => {
    if (!activeOutlet) return;
    setLoading(true);
    try {
      const recs = await api.listRecommendations(activeOutlet);
      setRecommendations(recs);
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [activeOutlet]);

  const handleApproveRec = async (rec) => {
    try {
      const qty = rec.suggested_qty;
      const res = await api.recordReceipt(activeOutlet, {
        sku_code: rec.sku,
        batch_number: `BAT-${rec.sku}-${Math.floor(Math.random()*9000)+1000}`,
        manufacture_date: new Date().toISOString().split('T')[0],
        expiry_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        quantity: qty
      });
      setFeedbackMsg(`✓ Purchase Order PO-${Math.floor(Math.random()*9000)+1000} approved for ${qty} units of ${rec.name}. Stock replenished to ${res.new_total_quantity}!`);
      await fetchRecommendations();
      window.dispatchEvent(new Event('stock-updated'));
    } catch (err) {
      setFeedbackMsg(`✗ Failed to approve PO: ${err.message}`);
    }
    setTimeout(() => setFeedbackMsg(''), 5000);
  };

  const handleRejectRec = (rec) => {
    setFeedbackMsg(`✗ Recommendation ${rec.id} rejected.`);
    setRecommendations(recommendations.filter(r => r.id !== rec.id));
    setTimeout(() => setFeedbackMsg(''), 4000);
  };

  const handleModifyRec = async (rec, newQty) => {
    try {
      const qty = Number(newQty);
      const res = await api.recordReceipt(activeOutlet, {
        sku_code: rec.sku,
        batch_number: `BAT-${rec.sku}-${Math.floor(Math.random()*9000)+1000}`,
        manufacture_date: new Date().toISOString().split('T')[0],
        expiry_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        quantity: qty
      });
      setFeedbackMsg(`✓ Modified & approved recommendation for ${qty} units of ${rec.name}. Stock replenished to ${res.new_total_quantity}!`);
      await fetchRecommendations();
      window.dispatchEvent(new Event('stock-updated'));
    } catch (err) {
      setFeedbackMsg(`✗ Failed to create PO: ${err.message}`);
    }
    setTimeout(() => setFeedbackMsg(''), 5000);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>
            Inventory Logistics Hub
            <span className="premium-badge" style={{
              marginLeft: '12px',
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              background: 'rgba(99, 102, 241, 0.15)',
              color: 'var(--primary)',
              border: '1px solid currentColor'
            }}>
              📦 Inventory Controller
            </span>
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Logged in: <strong style={{ color: 'var(--text-primary)' }}>{user?.username}</strong> • Outlet Scope: {activeOutlet?.substring(0, 8)}...
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

      {feedbackMsg && (
        <div style={{
          background: feedbackMsg.startsWith('✓') ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          border: `1px solid ${feedbackMsg.startsWith('✓') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
          color: feedbackMsg.startsWith('✓') ? 'var(--success)' : 'var(--critical)',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '0.85rem',
          transition: 'var(--transition-smooth)'
        }}>
          {feedbackMsg}
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
            Low-Stock SKU Alerts
          </span>
          <h1 className="glow-text-teal" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--accent-teal)' }}>
            {lowStockCount}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Items below reorder thresholds
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
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>🚚</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Active Transfers
          </span>
          <h1 className="glow-text-primary" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--primary)' }}>
            {transfers.filter(t => t.status !== 'RECEIVED').length}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Inter-branch shipments in progress
          </p>
        </div>
      </div>

      {/* Replenishment Approval Panel */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0 }}>🧠 Replenishment & Order Dispatch Panel</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Human-in-the-Loop approval gate for Rule-Based & AI-Generated purchase recommendations
            </p>
          </div>
          <span className="premium-badge badge-info animate-pulse-glow" style={{ fontSize: '0.75rem' }}>AI Forecast Active</span>
        </div>

        {recommendations.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: '0.9rem' }}>
            No pending replenishment recommendations.
          </p>
        ) : (
          <div className="premium-table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Product Details</th>
                  <th>Source</th>
                  <th>Confidence Score</th>
                  <th>Suggested Quantity</th>
                  <th>Recommendation Logic</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((rec) => (
                  <tr key={rec.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{rec.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{rec.sku}</div>
                    </td>
                    <td>
                      <span className={`premium-badge ${rec.source === 'AI_GENERATED' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                        {rec.source}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{(rec.confidence * 100).toFixed(0)}%</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{rec.suggested_qty} units</div>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {rec.reason}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button 
                          onClick={() => handleApproveRec(rec)}
                          className="premium-btn premium-btn-primary" 
                          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        >
                          Approve PO
                        </button>
                        <button 
                          onClick={() => {
                            const newQty = prompt(`Modify Order Qty for ${rec.name}:`, rec.suggested_qty);
                            if (newQty && !isNaN(newQty)) {
                              handleModifyRec(rec, parseInt(newQty));
                            }
                          }}
                          className="premium-btn premium-btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        >
                          Modify
                        </button>
                        <button 
                          onClick={() => handleRejectRec(rec)}
                          className="premium-btn premium-btn-danger" 
                          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

      {/* Stock Transfers Table */}
      <div className="glass-card">
        <h3 style={{ marginBottom: '16px' }}>Pending Inter-Branch Stock Transfers</h3>
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Transfer Reference</th>
                <th>Source Outlet</th>
                <th>Target Outlet</th>
                <th>Items Count</th>
                <th>Timestamp</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.id}</td>
                  <td>{item.source}</td>
                  <td>{item.target}</td>
                  <td>{item.items} units</td>
                  <td>{item.date}</td>
                  <td>
                    <span className={`premium-badge ${item.status === 'RECEIVED' ? 'badge-success' : item.status === 'DISPATCHED' ? 'badge-info' : 'badge-warning'}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {scanning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 9998,
        }}>
          <div className="animate-laser-scan" />
          <div style={{
            position: 'absolute',
            bottom: '40px',
            right: '40px',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--success)',
            color: 'var(--success)',
            padding: '16px 24px',
            borderRadius: '10px',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            boxShadow: '0 0 25px var(--success-glow)',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: 'var(--success)',
              boxShadow: '0 0 10px var(--success)'
            }} />
            <span>🔍 Scanning batch databases for expiries...</span>
          </div>
        </div>
      )}

    </div>
  );
}
