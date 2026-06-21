import React, { useState } from 'react';
import { api } from '../../services/api';

export default function FinanceManagerDashboard({
  user,
  activeOutlet,
  sessionSalesTotal
}) {
  const [queryInput, setQueryInput] = useState('');
  const [queryState, setQueryState] = useState('idle'); // idle, thinking, complete
  const [simulatedLog, setSimulatedLog] = useState([]);
  const [simulatedResult, setSimulatedResult] = useState(null);

  const sampleQueries = [
    { text: 'Show gross margins by drug category in Delhi NCR', resultType: 'margins' },
    { text: 'Compare revenue vs COGS for the past week', resultType: 'rev_cogs' },
    { text: 'Identify underperforming products', resultType: 'underperforming' }
  ];

  const handleRunQuery = async (queryText) => {
    setQueryInput(queryText);
    setQueryState('thinking');
    setSimulatedLog([]);
    setSimulatedResult(null);

    // Sequence of animations mimicking LLM + Text-to-SQL + Row-Level Security injection
    setTimeout(() => {
      setSimulatedLog(prev => [...prev, '🔍 LangChain Agent parsing intent: "Analyze financial statistics for Delhi region"']);
    }, 400);

    setTimeout(() => {
      setSimulatedLog(prev => [...prev, '🛡️ Enforcing Row-Level Security: Injecting user scope outlet_id = "Delhi NCR"']);
    }, 900);

    try {
      const res = await api.executeReportingQuery(queryText);
      
      setTimeout(() => {
        setSimulatedLog(prev => [...prev, `⚡ SQL Generated: ${res.sql}`]);
      }, 1400);

      setTimeout(() => {
        setQueryState('complete');
        setSimulatedResult({
          headers: res.headers,
          rows: res.rows
        });
      }, 2000);
    } catch (err) {
      setTimeout(() => {
        setQueryState('complete');
        setSimulatedLog(prev => [...prev, `❌ Error: ${err.message}`]);
      }, 1500);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>
            Financial Insights & Audit Hub
            <span className="premium-badge" style={{
              marginLeft: '12px',
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              background: 'rgba(245, 158, 11, 0.15)',
              color: 'var(--warning)',
              border: '1px solid currentColor'
            }}>
              🪙 Finance Manager
            </span>
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Logged in: <strong style={{ color: 'var(--text-primary)' }}>{user?.username}</strong> • Regional Billing: Delhi NCR (Delhi)
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
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>💵</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Gross Sales Revenue
          </span>
          <h1 className="glow-text-success" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--success)' }}>
            ${(14250.0 + sessionSalesTotal).toFixed(2)}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            दिल्ली region sales total
          </p>
        </div>

        <div className="glass-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>📉</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Cost of Goods Sold (COGS)
          </span>
          <h1 className="glow-text-teal" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--accent-teal)' }}>
            ${((14250.0 + sessionSalesTotal) * 0.65).toFixed(2)}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Estimated inventory acquisition cost
          </p>
        </div>

        <div className="glass-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>📈</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Gross Margin %
          </span>
          <h1 className="glow-text-primary" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--primary)' }}>
            35.0%
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Average profit ratio across categories
          </p>
        </div>

        <div className="glass-card" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '1.5rem', opacity: 0.8 }}>💳</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Average Ticket Value
          </span>
          <h1 className="glow-text-teal" style={{ fontSize: '2.5rem', margin: '12px 0 4px 0', color: 'var(--accent-teal)' }}>
            $42.50
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            AOV per billing register invoice
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* SVG Grouped Column Chart */}
        <div className="glass-card">
          <h3>📊 Revenue vs Cost of Goods Sold (COGS)</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Daily comparison of sales inflows vs inventory cost outflows
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '180px', paddingBottom: '16px' }}>
            {[
              { day: 'Mon', rev: 90, cogs: 58 },
              { day: 'Tue', rev: 110, cogs: 71 },
              { day: 'Wed', rev: 70, cogs: 45 },
              { day: 'Thu', rev: 140, cogs: 91 },
              { day: 'Fri', rev: 125, cogs: 81 },
              { day: 'Sat', rev: 150, cogs: 98 }
            ].map((d, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '130px' }}>
                  <div style={{ width: '12px', height: `${d.rev}px`, background: 'var(--success)', borderRadius: '2px 2px 0 0', filter: 'drop-shadow(0 0 2px var(--success-glow))' }}></div>
                  <div style={{ width: '12px', height: `${d.cogs}px`, background: 'var(--accent-teal)', borderRadius: '2px 2px 0 0', filter: 'drop-shadow(0 0 2px var(--accent-teal-glow))' }}></div>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{d.day}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '0.8rem', marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', background: 'var(--success)' }}></span>
              <span>Gross Sales</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', background: 'var(--accent-teal)' }}></span>
              <span>COGS</span>
            </div>
          </div>
        </div>

        {/* SVG Area Chart for Profit Margins */}
        <div className="glass-card">
          <h3>📈 Net Profit Margin Trend</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Historical analysis of regional profitability margins
          </p>
          <div style={{ position: 'relative', padding: '10px 0' }}>
            <svg width="100%" height="150" viewBox="0 0 400 150" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
              {/* Grid Lines */}
              <line x1="10" y1="20" x2="390" y2="20" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="10" y1="75" x2="390" y2="75" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="10" y1="130" x2="390" y2="130" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
              
              {/* Path */}
              <path d="M 10 70 L 80 50 L 160 90 L 240 40 L 320 60 L 390 35 L 390 130 L 10 130 Z" fill="rgba(99, 102, 241, 0.15)" />
              <path d="M 10 70 L 80 50 L 160 90 L 240 40 L 320 60 L 390 35" fill="none" stroke="var(--primary)" strokeWidth="3" />
              
              {/* Points */}
              <circle cx="10" cy="70" r="4" fill="var(--bg-deep)" stroke="var(--primary)" strokeWidth="2.5" />
              <circle cx="80" cy="50" r="4" fill="var(--bg-deep)" stroke="var(--primary)" strokeWidth="2.5" />
              <circle cx="160" cy="90" r="4" fill="var(--bg-deep)" stroke="var(--primary)" strokeWidth="2.5" />
              <circle cx="240" cy="40" r="4" fill="var(--bg-deep)" stroke="var(--primary)" strokeWidth="2.5" />
              <circle cx="320" cy="60" r="4" fill="var(--bg-deep)" stroke="var(--primary)" strokeWidth="2.5" />
              <circle cx="390" cy="35" r="4" fill="var(--bg-deep)" stroke="var(--primary)" strokeWidth="2.5" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              <span>Mon (30%)</span>
              <span>Tue (35%)</span>
              <span>Wed (28%)</span>
              <span>Thu (42%)</span>
              <span>Fri (38%)</span>
              <span>Sat (45%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Conversational Query RAG Widget */}
      <div className="glass-card" style={{ border: '1px solid rgba(245, 158, 11, 0.25)' }}>
        <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🤖 Conversational BI Query Assistant</span>
          <span className="premium-badge badge-warning" style={{ fontSize: '0.75rem' }}>AI RAG + Row-Level Security</span>
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Query corporate databases using natural language. Query engine automatically applies scope filters to restrict results.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {sampleQueries.map((q, idx) => (
            <button 
              key={idx}
              onClick={() => handleRunQuery(q.text)}
              className="premium-btn premium-btn-secondary"
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            >
              🔍 "{q.text}"
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Type your question, e.g. Show sales and net profit totals..."
            className="premium-input"
            style={{ flex: 1, fontSize: '0.9rem' }}
          />
          <button 
            onClick={() => handleRunQuery(queryInput)}
            disabled={!queryInput.trim() || queryState === 'thinking'}
            className="premium-btn premium-btn-primary"
            style={{ minWidth: '120px' }}
          >
            {queryState === 'thinking' ? 'Querying...' : 'Ask AI'}
          </button>
        </div>

        {queryState !== 'idle' && (
          <div style={{
            marginTop: '20px',
            background: 'rgba(6, 9, 19, 0.85)',
            border: '1px solid var(--border-glow)',
            borderRadius: '10px',
            padding: '16px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)'
          }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '10px', fontFamily: 'var(--font-primary)', fontSize: '0.9rem' }}>
              Execution Log
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {simulatedLog.map((log, idx) => (
                <div key={idx} style={{ 
                  color: log.startsWith('🛡️') ? 'var(--warning)' : log.startsWith('⚡') ? 'var(--accent-teal)' : 'var(--text-secondary)'
                }}>
                  {log}
                </div>
              ))}
              {queryState === 'thinking' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                  <span className="animate-pulse-glow">●</span> Processing telemetry database request...
                </div>
              )}
            </div>

            {simulatedResult && (
              <div className="animate-fade-in" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                <h4 style={{ color: 'var(--success)', marginBottom: '12px', fontFamily: 'var(--font-primary)', fontSize: '0.95rem' }}>
                  ✓ Query Result Returned
                </h4>
                <div className="premium-table-wrapper">
                  <table className="premium-table">
                    <thead>
                      <tr>
                        {simulatedResult.headers.map((h, i) => <th key={i}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {simulatedResult.rows.map((row, idx) => (
                        <tr key={idx}>
                          {row.map((cell, i) => (
                            <td key={i} style={{ fontWeight: i === 0 ? 600 : 'normal' }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transaction Ledger */}
      <div className="glass-card">
        <h3 style={{ marginBottom: '16px' }}>Sales Transactions Audit Ledger</h3>
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Outlet</th>
                <th>Total Amount</th>
                <th>Tax Included</th>
                <th>Discount Applied</th>
                <th>Timestamp</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>INV-89F12B</td>
                <td>Delhi Central</td>
                <td style={{ fontWeight: 600 }}>$185.00</td>
                <td>$9.25</td>
                <td>$0.00</td>
                <td>Just Now</td>
                <td><span className="premium-badge badge-success">COMPLETED</span></td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>INV-9A23E4</td>
                <td>Delhi Central</td>
                <td style={{ fontWeight: 600 }}>$420.00</td>
                <td>$21.00</td>
                <td>$10.00</td>
                <td>10 mins ago</td>
                <td><span className="premium-badge badge-success">COMPLETED</span></td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>INV-3B104F</td>
                <td>Gurugram Store</td>
                <td style={{ fontWeight: 600 }}>$310.00</td>
                <td>$15.50</td>
                <td>$5.00</td>
                <td>25 mins ago</td>
                <td><span className="premium-badge badge-success">COMPLETED</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
