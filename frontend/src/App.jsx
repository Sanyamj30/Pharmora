import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LandingView from './components/LandingView';
import LoginView from './components/LoginView';
import DashboardView from './components/DashboardView';
import InventoryView from './components/InventoryView';
import SalesView from './components/SalesView';
import PrescriptionView from './components/PrescriptionView';
import { getAuthUser, clearAuth, api } from './services/api';

function App() {
  const [user, setUser] = useState(getAuthUser());
  const [viewMode, setViewMode] = useState('landing');
  const [activeView, setActiveView] = useState('dashboard');
  const [activeOutlet, setActiveOutlet] = useState('');
  const [alerts, setAlerts] = useState([]);

  // Auto-redirect or handle expired session events
  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      clearAuth();
    };

    window.addEventListener('auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
    };
  }, []);

  // Update selected outlet once user logs in
  useEffect(() => {
    if (user && user.outlet_scope && user.outlet_scope.length > 0) {
      setActiveOutlet(user.outlet_scope[0]);
    } else {
      setActiveOutlet('');
    }
  }, [user]);

  const handleLoginSuccess = (claims) => {
    setUser(claims);
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
  };

  // Helper method triggered by child components to refresh notifications center
  const refreshAlerts = async () => {
    if (!activeOutlet) return;
    try {
      const lowStock = await api.listLowStock(activeOutlet);
      const expiries = await api.listExpiryAlerts(activeOutlet, 90);
      setAlerts([
        ...lowStock.map(item => ({ ...item, alert_type: 'warning', days_to_expiry: undefined })),
        ...expiries
      ]);
    } catch (e) {
      console.error('Failed to update telemetry feeds:', e);
    }
  };

  useEffect(() => {
    refreshAlerts();
  }, [activeOutlet]);

  if (!user) {
    if (viewMode === 'landing') {
      return <LandingView onLoginClick={() => setViewMode('login')} />;
    }
    return <LoginView onLoginSuccess={handleLoginSuccess} onBackClick={() => setViewMode('landing')} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation */}
      <Navbar
        activeView={activeView}
        setActiveView={setActiveView}
        user={user}
        activeOutlet={activeOutlet}
        setActiveOutlet={setActiveOutlet}
        alerts={alerts}
        onLogout={handleLogout}
      />

      {/* Main Workspace Container */}
      <main style={{ flex: 1, padding: '0 24px 40px 24px', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
        {activeView === 'dashboard' && (
          <DashboardView
            user={user}
            activeOutlet={activeOutlet}
            alerts={alerts}
            setAlerts={setAlerts}
            onScanComplete={refreshAlerts}
          />
        )}

        {activeView === 'inventory' && (
          <InventoryView
            activeOutlet={activeOutlet}
            triggerRefreshAlerts={refreshAlerts}
          />
        )}

        {activeView === 'sales' && (
          <SalesView
            activeOutlet={activeOutlet}
            triggerRefreshAlerts={refreshAlerts}
          />
        )}

        {activeView === 'prescriptions' && (
          <PrescriptionView
            activeOutlet={activeOutlet}
          />
        )}
      </main>


    </div>
  );
}

export default App;
