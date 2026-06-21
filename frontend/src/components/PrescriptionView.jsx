import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function PrescriptionView({ activeOutlet }) {
  const [activeSubTab, setActiveSubTab] = useState('lookup'); // 'lookup', 'register'
  
  // Lookup states
  const [lookupRef, setLookupRef] = useState('');
  const [prescription, setPrescription] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Register states
  const [doctorName, setDoctorName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  
  // Registry items
  const [items, setItems] = useState([{ product_id: '', max_quantity: 10 }]);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // OCR and stock states
  const [stockList, setStockList] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanLogs, setScanLogs] = useState([]);
  const [scanProgress, setScanProgress] = useState(0);

  useEffect(() => {
    if (!activeOutlet) return;
    api.listStock(activeOutlet).then(setStockList).catch(console.error);
  }, [activeOutlet]);

  const handleSimulateOCR = () => {
    setIsScanning(true);
    setScanProgress(0);
    setScanLogs(['[INFO] Booting neural parsing engine...', '[INFO] Acquiring image from optical sensor...']);
    
    setTimeout(() => {
      setScanProgress(25);
      setScanLogs(prev => [...prev, '[INFO] Document detected. Skew corrected by 0.45 deg.', '[INFO] Segmenting text fields using CRNN models...']);
    }, 600);

    setTimeout(() => {
      setScanProgress(60);
      setScanLogs(prev => [...prev, '[INFO] Transcribing handwritten annotations...', '[SUCCESS] Doctor identity recognized: Dr. Sarah Jenkins', '[SUCCESS] Clinical license signature match: LIC-882190A']);
    }, 1200);

    setTimeout(() => {
      setScanProgress(90);
      setScanLogs(prev => [...prev, '[INFO] Securing patient health indicators via SHA-256 hash...', '[SUCCESS] Extracted prescribed medications from image matrix.']);
    }, 1800);

    setTimeout(() => {
      setScanProgress(100);
      
      // Auto-populate form
      setDoctorName('Dr. Sarah Jenkins');
      setPatientId('AADHAR-9812-3304-4412');
      
      const todayStr = new Date().toISOString().substring(0, 10);
      setIssueDate(todayStr);
      
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 90);
      const expiryStr = expiry.toISOString().substring(0, 10);
      setExpiryDate(expiryStr);
      
      // Pick products from stockList to insert
      if (stockList && stockList.length > 0) {
        const selected = stockList.slice(0, 2).map(item => ({
          product_id: item.product.sku_code,
          max_quantity: Math.floor(Math.random() * 10) + 5
        }));
        setItems(selected);
      } else {
        setItems([
          { product_id: 'AMOXICILLIN-500', max_quantity: 10 },
          { product_id: 'PARACETAMOL-650', max_quantity: 15 }
        ]);
      }
      
      setScanLogs(prev => [...prev, '[SUCCESS] OCR parsing complete. Data transferred to form fields.']);
      
      setTimeout(() => {
        setIsScanning(false);
      }, 500);
    }, 2400);
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    setError('');
    setPrescription(null);
    if (!lookupRef.trim()) {
      setError('Please enter a prescription reference code.');
      return;
    }

    setLookupLoading(true);
    try {
      const data = await api.getPrescription(lookupRef.trim());
      setPrescription(data);
    } catch (err) {
      setError(err.message || 'Prescription reference not found.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleAddField = () => {
    setItems([...items, { product_id: '', max_quantity: 10 }]);
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const handleRemoveField = (index) => {
    const updated = [...items];
    updated.splice(index, 1);
    setItems(updated);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Date checks
    if (new Date(expiryDate) <= new Date(issueDate)) {
      setError('Date validation rule violation: Expiry Date must be strictly after Issue Date.');
      return;
    }

    // Prepare line items
    const filteredItems = items.filter(i => i.product_id);
    if (filteredItems.length === 0) {
      setError('Please add at least one valid product.');
      return;
    }

    try {
      const payload = {
        doctor_name: doctorName,
        patient_id: patientId, // Backend will encrypt this automatically
        issue_date: issueDate,
        expiry_date: expiryDate,
        items: filteredItems.map(item => ({
          product_id: item.product_id,
          max_quantity: parseInt(item.max_quantity)
        }))
      };

      const result = await api.registerPrescription(payload);
      setSuccess(`Prescription registered successfully! Reference Code: ${result.reference_code}`);
      
      // Reset form
      setDoctorName('');
      setPatientId('');
      setIssueDate('');
      setExpiryDate('');
      setItems([{ product_id: '', max_quantity: 10 }]);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Tab navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Prescription Hub & Registry</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Register medical prescriptions, decrypt patient metrics securely, and audit dispensing histories.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { id: 'lookup', label: 'Lookup Registry' },
            { id: 'register', label: '✍️ Register Prescription' }
          ].map((subTab) => (
            <button
              key={subTab.id}
              onClick={() => {
                setActiveSubTab(subTab.id);
                setError('');
                setSuccess('');
                setPrescription(null);
              }}
              className="premium-btn premium-btn-secondary"
              style={{
                fontSize: '0.85rem',
                padding: '8px 16px',
                borderColor: activeSubTab === subTab.id ? 'var(--primary)' : 'var(--border-glow)',
                background: activeSubTab === subTab.id ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.02)'
              }}
            >
              {subTab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
          padding: '12px 16px',
          color: 'var(--critical)',
          fontSize: '0.85rem'
        }}>
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '8px',
          padding: '12px 16px',
          color: 'var(--success)',
          fontSize: '0.85rem'
        }}>
          ✅ {success}
        </div>
      )}

      {/* Lookup view */}
      {activeSubTab === 'lookup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
            <h3 style={{ marginBottom: '16px' }}>Query Prescription registry</h3>
            <form onSubmit={handleLookup} style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                required
                placeholder="Enter Reference Code (e.g. RX-2026-...)"
                className="premium-input"
                value={lookupRef}
                onChange={(e) => setLookupRef(e.target.value)}
              />
              <button type="submit" className="premium-btn premium-btn-primary" disabled={lookupLoading}>
                {lookupLoading ? 'Searching...' : '🔍 Search'}
              </button>
            </form>
          </div>

          {prescription && (
            <div className="glass-card animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glow)', paddingBottom: '16px', marginBottom: '20px' }}>
                <div>
                  <span className="premium-badge badge-info" style={{ marginBottom: '8px' }}>
                    Reference: {prescription.reference_code}
                  </span>
                  <h2>Issued by: {prescription.doctor_name}</h2>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`premium-badge ${new Date(prescription.expiry_date) < new Date() ? 'badge-danger' : 'badge-success'}`}>
                    {new Date(prescription.expiry_date) < new Date() ? 'Expired' : 'Active'}
                  </span>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    Expires: {prescription.expiry_date}
                  </div>
                </div>
              </div>

              {/* Decrypted Patient Information */}
              <div style={{
                background: 'rgba(99, 102, 241, 0.05)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px'
              }}>
                <h4 style={{ color: 'var(--primary)', marginBottom: '4px' }}>🛡️ Secured Compliance Metrics</h4>
                <div style={{ display: 'flex', gap: '24px', fontSize: '0.9rem' }}>
                  <div>
                    <strong>Patient ID (On-the-fly Decrypted):</strong>{' '}
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                      {prescription.patient_id || 'UNKNOWN'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Allowed Line Items */}
              <h3 style={{ marginBottom: '16px' }}>Authorized Medications</h3>
              <div className="premium-table-wrapper">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Product ID</th>
                      <th>Max Prescribed Quantity</th>
                      <th>Currently Dispensed</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prescription.items?.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{item.product_id}</td>
                        <td style={{ fontWeight: 600 }}>{item.max_quantity} Units</td>
                        <td style={{ color: 'var(--warning)' }}>{item.dispensed_quantity} Units</td>
                        <td>
                          <span className={`premium-badge ${item.dispensed_quantity >= item.max_quantity ? 'badge-danger' : 'badge-success'}`}>
                            {item.dispensed_quantity >= item.max_quantity ? 'Exhausted' : 'Dispense Allowed'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Register Prescription View */}
      {activeSubTab === 'register' && (
        <div className="glass-card" style={{ maxWidth: '750px', margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0 }}>✍️ Register New Doctor Prescription</h3>
            <button
              type="button"
              onClick={handleSimulateOCR}
              className="premium-btn premium-btn-primary animate-pulse-glow"
              style={{
                fontSize: '0.85rem',
                padding: '8px 16px',
                background: 'linear-gradient(135deg, var(--primary), var(--accent-teal))',
                border: 'none'
              }}
            >
              📷 Simulated AI OCR Scanner
            </button>
          </div>
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="premium-input-container">
                <label className="premium-label">Doctor Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Alice Cooper"
                  className="premium-input"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                />
              </div>
              <div className="premium-input-container">
                <label className="premium-label">Patient National Identification (Secured)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AADHAR-9921-2291"
                  className="premium-input"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="premium-input-container">
                <label className="premium-label">Issue Date</label>
                <input
                  type="date"
                  required
                  className="premium-input"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div className="premium-input-container">
                <label className="premium-label">Expiry Date</label>
                <input
                  type="date"
                  required
                  className="premium-input"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>

            {/* Dynamic Items Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="premium-label">Prescribed Medications</span>
                <button
                  type="button"
                  onClick={handleAddField}
                  className="premium-btn premium-btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  ➕ Add Drug Row
                </button>
              </div>

              {items.map((item, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '16px', alignItems: 'end' }}>
                  <div className="premium-input-container">
                    <label className="premium-label">Product ID (UUID or SKU Name)</label>
                    <input
                      type="text"
                      required
                      placeholder="Enter SKU / Product ID"
                      className="premium-input"
                      value={item.product_id}
                      onChange={(e) => handleItemChange(index, 'product_id', e.target.value)}
                    />
                  </div>
                  <div className="premium-input-container">
                    <label className="premium-label">Quantity Allowed</label>
                    <input
                      type="number"
                      required
                      min="1"
                      className="premium-input"
                      value={item.max_quantity}
                      onChange={(e) => handleItemChange(index, 'max_quantity', e.target.value)}
                    />
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveField(index)}
                      className="premium-btn premium-btn-danger"
                      style={{ padding: '12px', borderRadius: '10px' }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button type="submit" className="premium-btn premium-btn-primary" style={{ width: '100%', marginTop: '12px' }}>
              Save & Register Prescription
            </button>
          </form>
        </div>
      )}

      {/* Simulated AI OCR Modal Overlay */}
      {isScanning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(5, 9, 19, 0.9)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '24px'
        }}>
          <div className="glass-card" style={{
            maxWidth: '500px',
            width: '100%',
            background: 'var(--bg-dark)',
            border: '1px solid var(--primary)',
            boxShadow: '0 0 30px var(--primary-glow)',
            padding: '30px',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            <h3 style={{ textAlign: 'center', color: 'var(--primary)', margin: 0 }} className="glow-text-primary">
              🤖 AI Vision Rx OCR Scanner v4.0
            </h3>
            
            {/* Visual Scan Box */}
            <div style={{
              height: '160px',
              border: '2px dashed rgba(16, 185, 129, 0.3)',
              borderRadius: '12px',
              position: 'relative',
              overflow: 'hidden',
              background: 'rgba(16, 185, 129, 0.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--success)'
            }}>
              <div className="animate-laser-scan"></div>
              <div style={{ textAlign: 'center', zIndex: 5 }}>
                <span style={{ fontSize: '2rem' }}>📄</span>
                <p style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '8px', fontWeight: 600 }}>
                  SCANNING RX_DOCUMENT.PNG
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Neural Analysis Progress</span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{scanProgress}%</span>
              </div>
              <div style={{
                height: '6px',
                width: '100%',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${scanProgress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--primary), var(--accent-teal))',
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>

            {/* Terminal logs console */}
            <div style={{
              background: '#040711',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              padding: '12px 16px',
              height: '140px',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              color: '#34d399'
            }}>
              {scanLogs.map((log, idx) => (
                <div key={idx} style={{
                  color: log.includes('SUCCESS') ? 'var(--success)' : log.includes('ERROR') ? 'var(--critical)' : '#94a3b8'
                }}>{log}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
