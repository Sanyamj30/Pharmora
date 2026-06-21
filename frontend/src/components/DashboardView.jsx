import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import RegionalAdminDashboard from './dashboards/RegionalAdminDashboard';
import PharmacistDashboard from './dashboards/PharmacistDashboard';
import InventoryControllerDashboard from './dashboards/InventoryControllerDashboard';
import FinanceManagerDashboard from './dashboards/FinanceManagerDashboard';

export default function DashboardView({ user, activeOutlet, alerts, setAlerts, onScanComplete }) {
  const [lowStockCount, setLowStockCount] = useState(0);
  const [expiryAlerts, setExpiryAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState('');

  const fetchDashboardData = async () => {
    if (!activeOutlet) return;
    setLoading(true);
    try {
      // Fetch low stock items
      const lowStock = await api.listLowStock(activeOutlet);
      setLowStockCount(lowStock.length);
      
      // Fetch expiry alerts
      const expiries = await api.listExpiryAlerts(activeOutlet, 90);
      setExpiryAlerts(expiries);
      
      // Update global alerts list in App context
      const combinedAlerts = [
        ...lowStock.map(item => ({ ...item, alert_type: 'warning', days_to_expiry: undefined })),
        ...expiries
      ];
      setAlerts(combinedAlerts);
    } catch (err) {
      console.error('Failed to load dashboard statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    window.addEventListener('stock-updated', fetchDashboardData);
    return () => {
      window.removeEventListener('stock-updated', fetchDashboardData);
    };
  }, [activeOutlet]);

  const getTrendData = () => {
    let sessionSalesTotalLocal = 0;
    try {
      const sales = JSON.parse(localStorage.getItem('session_sales') || '[]');
      sessionSalesTotalLocal = sales.reduce((sum, item) => sum + (item.total_amount || 0), 0);
    } catch (e) {
      console.error(e);
    }

    return [
      { day: '12 Jun', amount: 245.0 },
      { day: '13 Jun', amount: 310.0 },
      { day: '14 Jun', amount: 185.0 },
      { day: '15 Jun', amount: 420.0 },
      { day: '16 Jun', amount: 380.0 },
      { day: '17 Jun', amount: 510.0 + sessionSalesTotalLocal }
    ];
  };

  const trendData = getTrendData();
  const width = 600;
  const height = 200;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  
  const maxAmount = Math.max(...trendData.map(d => d.amount), 600) * 1.1;
  
  const points = trendData.map((d, i) => {
    const x = paddingLeft + (i * (chartWidth / (trendData.length - 1)));
    const y = height - paddingBottom - ((d.amount / maxAmount) * chartHeight);
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const bottomY = height - paddingBottom;
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${bottomY} L ${points[0].x} ${bottomY} Z`;

  const handleTriggerScan = async () => {
    setScanning(true);
    setScanResult('');
    try {
      const result = await api.triggerExpiryScan();
      setScanResult(`Scan complete: Emitted ${result.alerts_emitted} Kafka alerts.`);
      fetchDashboardData();
      if (onScanComplete) onScanComplete();
    } catch (err) {
      setScanResult(`Scan failed: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  const criticalExpiries = expiryAlerts.filter(a => a.alert_type === 'urgent');
  const warningExpiries = expiryAlerts.filter(a => a.alert_type === 'warning');

  // Compute session sales total
  let sessionSalesTotal = 0;
  try {
    const sales = JSON.parse(localStorage.getItem('session_sales') || '[]');
    sessionSalesTotal = sales.reduce((sum, item) => sum + (item.total_amount || 0), 0);
  } catch (e) {
    console.error(e);
  }

  // Loading indicator for telemetry feeds
  if (loading && expiryAlerts.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh', color: 'var(--text-secondary)' }}>
        <div className="animate-pulse-glow" style={{ fontSize: '1.2rem' }}>
          Initializing Operational Feeds...
        </div>
      </div>
    );
  }

  // Switch based on user role
  switch (user?.role) {
    case 'regional_admin':
      return (
        <RegionalAdminDashboard
          user={user}
          activeOutlet={activeOutlet}
          lowStockCount={lowStockCount}
          criticalExpiries={criticalExpiries}
          warningExpiries={warningExpiries}
          scanning={scanning}
          scanResult={scanResult}
          handleTriggerScan={handleTriggerScan}
          expiryAlerts={expiryAlerts}
          trendData={trendData}
          points={points}
          areaPath={areaPath}
          linePath={linePath}
          maxAmount={maxAmount}
        />
      );
    case 'pharmacist':
      return (
        <PharmacistDashboard
          user={user}
          activeOutlet={activeOutlet}
          sessionSalesTotal={sessionSalesTotal}
          points={points}
          areaPath={areaPath}
          linePath={linePath}
          trendData={trendData}
        />
      );
    case 'inventory_controller':
      return (
        <InventoryControllerDashboard
          user={user}
          activeOutlet={activeOutlet}
          lowStockCount={lowStockCount}
          criticalExpiries={criticalExpiries}
          warningExpiries={warningExpiries}
          scanning={scanning}
          scanResult={scanResult}
          handleTriggerScan={handleTriggerScan}
          expiryAlerts={expiryAlerts}
        />
      );
    case 'finance_manager':
      return (
        <FinanceManagerDashboard
          user={user}
          activeOutlet={activeOutlet}
          sessionSalesTotal={sessionSalesTotal}
        />
      );
    default:
      return (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
          <h3 style={{ color: 'var(--critical)' }}>⚠️ Role Unauthorized</h3>
          <p style={{ marginTop: '10px' }}>
            Your account role "<strong>{user?.role}</strong>" does not have an operational dashboard configured. Please contact the administrator.
          </p>
        </div>
      );
  }
}
