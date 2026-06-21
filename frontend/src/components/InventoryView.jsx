import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function InventoryView({ activeOutlet, triggerRefreshAlerts }) {
  const [stockList, setStockList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('list'); // 'list', 'add-product', 'receipt', 'adjust'

  // Selected SKU for batch FEFO lookup
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productBatches, setProductBatches] = useState([]);

  // Form states
  const [prodSku, setProdSku] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('General');
  const [prodSched, setProdSched] = useState('N/A'); // 'N/A', 'H', 'X'
  const [prodUom, setProdUom] = useState('box');
  const [prodReorder, setProdReorder] = useState(10);
  const [prodLead, setProdLead] = useState(5);

  const [recSku, setRecSku] = useState('');
  const [recBatchNo, setRecBatchNo] = useState('');
  const [recQty, setRecQty] = useState(100);
  const [recMfgDate, setRecMfgDate] = useState('');
  const [recExpDate, setRecExpDate] = useState('');

  const [adjProdId, setAdjProdId] = useState('');
  const [adjBatchId, setAdjBatchId] = useState('');
  const [adjDelta, setAdjDelta] = useState(-5);
  const [adjReason, setAdjReason] = useState('DAMAGE');
  const [adjBatchesList, setAdjBatchesList] = useState([]);

  // Stock Transfer states
  const [transfers, setTransfers] = useState([]);
  const [trfTargetOutlet, setTrfTargetOutlet] = useState('22222222-2222-2222-2222-22222222222b');
  const [trfProductId, setTrfProductId] = useState('');
  const [trfQty, setTrfQty] = useState(10);
  const [trfLines, setTrfLines] = useState([]);

  const fetchStock = async () => {
    if (!activeOutlet) return;
    setLoading(true);
    try {
      const data = await api.listStock(activeOutlet);
      setStockList(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch stock levels.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransfers = async () => {
    try {
      const data = await api.listTransfers();
      setTransfers(data);
    } catch (err) {
      console.error("Transfers error:", err);
    }
  };

  useEffect(() => {
    fetchStock();
    fetchTransfers();
  }, [activeOutlet, activeSubTab]);

  const viewBatches = async (product) => {
    setSelectedProduct(product);
    try {
      const data = await api.listFEFOBatches(activeOutlet, product.product_id);
      setProductBatches(data);
    } catch (err) {
      setError(`Failed to retrieve batch lists: ${err.message}`);
    }
  };

  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    if (trfLines.length === 0) {
      setError('Please add at least one item to the transfer.');
      return;
    }
    setError('');
    setSuccess('');
    try {
      await api.createTransfer({
        source_outlet_id: activeOutlet,
        destination_outlet_id: trfTargetOutlet,
        line_items: trfLines.map(l => ({
          product_id: l.product_id,
          quantity: l.quantity
        }))
      });
      setSuccess('Transfer order created successfully in DRAFT status.');
      setTrfLines([]);
      fetchTransfers();
      fetchStock();
    } catch (err) {
      setError(err.message || 'Failed to create transfer order.');
    }
  };

  const handleAddTrfLine = (e) => {
    e.preventDefault();
    if (!trfProductId) return;
    const prod = stockList.find(s => s.product_id === trfProductId);
    if (!prod) return;
    
    // Check duplicates
    if (trfLines.some(l => l.product_id === trfProductId)) {
      setError('Product already added to transfer lines.');
      return;
    }

    if (parseInt(trfQty) <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }

    setTrfLines([
      ...trfLines,
      {
        product_id: trfProductId,
        product_name: prod.product.name,
        sku_code: prod.product.sku_code,
        quantity: parseInt(trfQty)
      }
    ]);
    setError('');
  };

  const handleUpdateTransferStatus = async (id, action) => {
    setError('');
    setSuccess('');
    try {
      if (action === 'approve') await api.approveTransfer(id);
      else if (action === 'dispatch') await api.dispatchTransfer(id);
      else if (action === 'receive') await api.receiveTransfer(id);
      else if (action === 'cancel') await api.cancelTransfer(id);
      setSuccess(`Transfer status updated to ${action}d successfully.`);
      fetchTransfers();
      fetchStock();
    } catch (err) {
      setError(err.message || 'Failed to update transfer status.');
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api.createProduct({
        sku_code: prodSku,
        name: prodName,
        category: prodCategory,
        schedule_class: prodSched,
        unit_of_measure: prodUom,
        reorder_point: parseInt(prodReorder),
        lead_time_days: parseInt(prodLead)
      });
      setSuccess(`Product SKU ${prodSku} successfully created!`);
      // Reset
      setProdSku('');
      setProdName('');
      fetchStock();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRecordReceipt = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (new Date(recExpDate) <= new Date(recMfgDate)) {
      setError('Date validation rule violation: Expiry Date must be strictly after Manufacture Date.');
      return;
    }

    try {
      await api.recordReceipt(activeOutlet, {
        sku_code: recSku,
        batch_number: recBatchNo,
        quantity: parseInt(recQty),
        manufacture_date: recMfgDate,
        expiry_date: recExpDate
      });
      setSuccess(`Batch ${recBatchNo} received successfully!`);
      setRecSku('');
      setRecBatchNo('');
      fetchStock();
      triggerRefreshAlerts();
    } catch (err) {
      setError(err.message);
    }
  };

  // Helper when selecting product inside Adjustment tab to fetch its active batches
  const handleAdjProductChange = async (productId) => {
    setAdjProdId(productId);
    setAdjBatchId('');
    if (!productId) {
      setAdjBatchesList([]);
      return;
    }
    try {
      const data = await api.listFEFOBatches(activeOutlet, productId);
      setAdjBatchesList(data);
    } catch (err) {
      setError(`Failed to retrieve batches for adjustment: ${err.message}`);
    }
  };

  const handleRecordAdjustment = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!adjProdId || !adjBatchId) {
      setError('Please select both a product and a batch.');
      return;
    }

    try {
      await api.recordAdjustment(activeOutlet, {
        product_id: adjProdId,
        batch_id: adjBatchId,
        quantity_delta: parseInt(adjDelta),
        reason: adjReason
      });
      setSuccess('Manual stock adjustment recorded successfully!');
      setAdjProdId('');
      setAdjBatchId('');
      setAdjBatchesList([]);
      fetchStock();
      triggerRefreshAlerts();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Inventory Operations</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Register catalogue items, record stock receipts, audit batches, or run physical counts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { id: 'list', label: 'Stock Levels' },
            { id: 'add-product', label: '+ Add Product' },
            { id: 'receipt', label: '📦 Receive Stock' },
            { id: 'adjust', label: '🔧 Adjust Stock' },
            { id: 'transfers', label: '🔄 Stock Transfers' }
          ].map((subTab) => (
            <button
              key={subTab.id}
              onClick={() => {
                setActiveSubTab(subTab.id);
                setError('');
                setSuccess('');
                setSelectedProduct(null);
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

      {/* Main tab view contents */}

      {activeSubTab === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedProduct ? '1.5fr 1fr' : '1fr', gap: '24px', alignItems: 'start' }}>
          {/* Main Stock Table */}
          <div className="glass-card">
            <h3 style={{ marginBottom: '16px' }}>Current Stock Levels</h3>
            {loading ? (
              <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>Loading levels...</p>
            ) : stockList.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No stock registered at this outlet.</p>
            ) : (
              <div className="premium-table-wrapper">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>SKU Code</th>
                      <th>Product Name</th>
                      <th>Category</th>
                      <th>Class</th>
                      <th>Reorder Point</th>
                      <th>Available Qty</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockList.map((stock) => {
                      const isLowStock = stock.total_quantity < stock.product.reorder_point;
                      return (
                        <tr 
                          key={stock.id} 
                          onClick={() => viewBatches(stock)}
                          style={{
                            cursor: 'pointer',
                            background: selectedProduct?.id === stock.id ? 'rgba(99, 102, 241, 0.05)' : 'transparent'
                          }}
                        >
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{stock.product.sku_code}</td>
                          <td style={{ fontWeight: 600 }}>{stock.product.name}</td>
                          <td>{stock.product.category}</td>
                          <td>
                            <span className={`premium-badge ${stock.product.schedule_class !== 'N/A' ? 'badge-danger' : 'badge-info'}`}>
                              {stock.product.schedule_class}
                            </span>
                          </td>
                          <td>{stock.product.reorder_point} {stock.product.unit_of_measure}</td>
                          <td style={{ fontWeight: 'bold', color: isLowStock ? 'var(--warning)' : 'var(--text-primary)' }}>
                            {stock.total_quantity}
                          </td>
                          <td>
                            <span className={`premium-badge ${isLowStock ? 'badge-warning' : 'badge-success'}`}>
                              {isLowStock ? 'Low Stock' : 'Good'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Side Drawer displaying FEFO Batches for selected product */}
          {selectedProduct && (
            <div className="glass-card animate-fade-in" style={{ borderLeft: '3px solid var(--primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3>Batches for {selectedProduct.product.name}</h3>
                <button 
                  onClick={() => setSelectedProduct(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.25rem' }}
                >
                  ✕
                </button>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Sorted by **First Expiry First Out (FEFO)** order:
              </p>
              {productBatches.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No active batches for this SKU.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {productBatches.map((batch) => {
                    const isExhausted = batch.quantity <= 0;
                    return (
                      <div 
                        key={batch.id} 
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border-glow)',
                          borderRadius: '8px',
                          padding: '12px',
                          fontSize: '0.85rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                          <span>Batch #{batch.batch_number}</span>
                          <span style={{ color: isExhausted ? 'var(--text-muted)' : 'var(--success)' }}>
                            {batch.quantity} Units
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '6px' }}>
                          <span>Mfg: {batch.manufacture_date}</span>
                          <span style={{ color: 'var(--warning)' }}>Exp: {batch.expiry_date}</span>
                        </div>
                        <div style={{ marginTop: '8px' }}>
                          <span className={`premium-badge ${isExhausted ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.65rem' }}>
                            {batch.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'add-product' && (
        <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
          <h3 style={{ marginBottom: '20px' }}>Add General Catalogue Item</h3>
          <form onSubmit={handleAddProduct} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="premium-input-container">
                <label className="premium-label">SKU Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SKU-PARA-500"
                  className="premium-input"
                  value={prodSku}
                  onChange={(e) => setProdSku(e.target.value)}
                />
              </div>
              <div className="premium-input-container">
                <label className="premium-label">Product Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Paracetamol 500mg"
                  className="premium-input"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="premium-input-container">
                <label className="premium-label">Category</label>
                <input
                  type="text"
                  className="premium-input"
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value)}
                />
              </div>
              <div className="premium-input-container">
                <label className="premium-label">Schedule Class (Compliance)</label>
                <select
                  className="premium-input"
                  value={prodSched}
                  onChange={(e) => setProdSched(e.target.value)}
                >
                  <option value="N/A">N/A (General)</option>
                  <option value="H">Schedule H (Regulated)</option>
                  <option value="X">Schedule X (Narcotics)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr', gap: '16px' }}>
              <div className="premium-input-container">
                <label className="premium-label">Unit of Measure</label>
                <input
                  type="text"
                  className="premium-input"
                  placeholder="e.g. tablet, box"
                  value={prodUom}
                  onChange={(e) => setProdUom(e.target.value)}
                />
              </div>
              <div className="premium-input-container">
                <label className="premium-label">Reorder Limit Point</label>
                <input
                  type="number"
                  className="premium-input"
                  value={prodReorder}
                  onChange={(e) => setProdReorder(e.target.value)}
                />
              </div>
              <div className="premium-input-container">
                <label className="premium-label">Lead Time (Days)</label>
                <input
                  type="number"
                  className="premium-input"
                  value={prodLead}
                  onChange={(e) => setProdLead(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="premium-btn premium-btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              Create Catalogue Item
            </button>
          </form>
        </div>
      )}

      {activeSubTab === 'receipt' && (
        <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
          <h3 style={{ marginBottom: '20px' }}>📦 Record Stock Batch Receipt</h3>
          <form onSubmit={handleRecordReceipt} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="premium-input-container">
                <label className="premium-label">Product SKU Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SKU-PARA-500"
                  className="premium-input"
                  value={recSku}
                  onChange={(e) => setRecSku(e.target.value)}
                />
              </div>
              <div className="premium-input-container">
                <label className="premium-label">Batch Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BATCH-2026-001"
                  className="premium-input"
                  value={recBatchNo}
                  onChange={(e) => setRecBatchNo(e.target.value)}
                />
              </div>
            </div>

            <div className="premium-input-container">
              <label className="premium-label">Received Quantity</label>
              <input
                type="number"
                required
                className="premium-input"
                value={recQty}
                onChange={(e) => setRecQty(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="premium-input-container">
                <label className="premium-label">Manufacture Date</label>
                <input
                  type="date"
                  required
                  className="premium-input"
                  value={recMfgDate}
                  onChange={(e) => setRecMfgDate(e.target.value)}
                />
              </div>
              <div className="premium-input-container">
                <label className="premium-label">Expiry Date</label>
                <input
                  type="date"
                  required
                  className="premium-input"
                  value={recExpDate}
                  onChange={(e) => setRecExpDate(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="premium-btn premium-btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              Confirm Stock Receipt
            </button>
          </form>
        </div>
      )}

      {activeSubTab === 'adjust' && (
        <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
          <h3 style={{ marginBottom: '20px' }}>🔧 Record Manual Stock Adjustment</h3>
          <form onSubmit={handleRecordAdjustment} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="premium-input-container">
              <label className="premium-label">Select SKU Item</label>
              <select
                className="premium-input"
                value={adjProdId}
                onChange={(e) => handleAdjProductChange(e.target.value)}
              >
                <option value="">-- Select Product --</option>
                {stockList.map((item) => (
                  <option key={item.product_id} value={item.product_id}>
                    {item.product.name} ({item.product.sku_code})
                  </option>
                ))}
              </select>
            </div>

            {adjProdId && (
              <div className="premium-input-container">
                <label className="premium-label">Select Active Batch</label>
                <select
                  required
                  className="premium-input"
                  value={adjBatchId}
                  onChange={(e) => setAdjBatchId(e.target.value)}
                >
                  <option value="">-- Select Batch --</option>
                  {adjBatchesList.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      #{batch.batch_number} (Exp: {batch.expiry_date}) - qty: {batch.quantity}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="premium-input-container">
                <label className="premium-label">Quantity Delta (Positive / Negative)</label>
                <input
                  type="number"
                  required
                  className="premium-input"
                  placeholder="e.g. -5 (subtract) or 10 (add)"
                  value={adjDelta}
                  onChange={(e) => setAdjDelta(e.target.value)}
                />
              </div>
              <div className="premium-input-container">
                <label className="premium-label">Adjustment Reason</label>
                <select
                  className="premium-input"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                >
                  <option value="DAMAGE">DAMAGE (Subtract)</option>
                  <option value="EXPIRED">EXPIRED (Subtract)</option>
                  <option value="THEFT">THEFT (Subtract)</option>
                  <option value="AUDIT_DISCREPANCY">AUDIT DISCREPANCY (Correction)</option>
                </select>
              </div>
            </div>

            <button type="submit" className="premium-btn premium-btn-danger" style={{ width: '100%', marginTop: '8px' }}>
              Post Manual Adjustment
            </button>
          </form>
        </div>
      )}

      {activeSubTab === 'transfers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Split Create Transfer Panel */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', alignItems: 'start' }}>
            {/* Left Side: Create Transfer */}
            <div className="glass-card">
              <h3 style={{ marginBottom: '16px' }}>Create Inter-Outlet Stock Transfer Request</h3>
              <form onSubmit={handleCreateTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="premium-input-container">
                  <label className="premium-label">Destination Outlet</label>
                  <select
                    className="premium-input"
                    value={trfTargetOutlet}
                    onChange={(e) => setTrfTargetOutlet(e.target.value)}
                  >
                    <option value="22222222-2222-2222-2222-22222222222b">Noida Sector 62</option>
                    <option value="33333333-3333-3333-3333-33333333333c">Gurgaon Cyber City</option>
                  </select>
                </div>

                <div style={{ border: '1px solid rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                  <h4 style={{ marginBottom: '12px' }}>Add Line Item</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'end' }}>
                    <div className="premium-input-container">
                      <label className="premium-label">Select Catalogue Item</label>
                      <select
                        className="premium-input"
                        value={trfProductId}
                        onChange={(e) => setTrfProductId(e.target.value)}
                      >
                        <option value="">-- Choose Item --</option>
                        {stockList.map((item) => (
                          <option key={item.product_id} value={item.product_id}>
                            {item.product.name} ({item.product.sku_code}) - Avail: {item.total_quantity}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="premium-input-container">
                      <label className="premium-label">Transfer Quantity</label>
                      <input
                        type="number"
                        min="1"
                        className="premium-input"
                        value={trfQty}
                        onChange={(e) => setTrfQty(e.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTrfLine}
                    className="premium-btn premium-btn-secondary"
                    style={{ marginTop: '12px', width: '100%' }}
                  >
                    + Add to Order Draft
                  </button>
                </div>

                {trfLines.length > 0 && (
                  <div>
                    <h4 style={{ marginBottom: '8px' }}>Draft Transfer Line Items</h4>
                    <div className="premium-table-wrapper" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      <table className="premium-table">
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Product Name</th>
                            <th>Qty</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trfLines.map((line, idx) => (
                            <tr key={idx}>
                              <td>{line.sku_code}</td>
                              <td>{line.product_name}</td>
                              <td>{line.quantity}</td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => setTrfLines(trfLines.filter((_, i) => i !== idx))}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--critical)', cursor: 'pointer' }}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={trfLines.length === 0}
                  className="premium-btn premium-btn-primary"
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  🚀 Submit Transfer Request (DRAFT)
                </button>
              </form>
            </div>

            {/* Right Side: Quick Info */}
            <div className="glass-card">
              <h3 style={{ marginBottom: '12px' }}>🔄 Transfer Protocol</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Inter-outlet stock transfers maintain strict chain-of-custody tracking.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px', fontSize: '0.8rem' }}>
                <div style={{ padding: '8px', borderLeft: '3px solid var(--warning)', backgroundColor: 'rgba(251, 191, 36, 0.05)' }}>
                  <strong>1. DRAFT</strong>
                  <div>Stock is reserved from the source outlet's active levels to prevent double-selling.</div>
                </div>
                <div style={{ padding: '8px', borderLeft: '3px solid var(--primary)', backgroundColor: 'rgba(99, 102, 241, 0.05)' }}>
                  <strong>2. APPROVED</strong>
                  <div>The transfer manager approves the dispatch plan and assigns logistics routes.</div>
                </div>
                <div style={{ padding: '8px', borderLeft: '3px solid var(--accent-teal)', backgroundColor: 'rgba(20, 184, 166, 0.05)' }}>
                  <strong>3. DISPATCHED</strong>
                  <div>Stock quantity and batches are formally deducted from the source outlet.</div>
                </div>
                <div style={{ padding: '8px', borderLeft: '3px solid var(--success)', backgroundColor: 'rgba(16, 185, 129, 0.05)' }}>
                  <strong>4. RECEIVED</strong>
                  <div>Stock is added to the destination outlet and batches are merged in FEFO sequence.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Table: List of Transfers */}
          <div className="glass-card">
            <h3 style={{ marginBottom: '16px' }}>Stock Transfer Audit Log</h3>
            {transfers.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No stock transfers found.</p>
            ) : (
              <div className="premium-table-wrapper">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Ref Code</th>
                      <th>Source Outlet</th>
                      <th>Target Outlet</th>
                      <th>Status</th>
                      <th>Date Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((order) => {
                      const isSource = order.source_outlet_id === activeOutlet;
                      const isDest = order.destination_outlet_id === activeOutlet;
                      return (
                        <tr key={order.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>TRF-{order.id.substring(0, 8).toUpperCase()}</td>
                          <td>{order.source_outlet_id === '11111111-1111-1111-1111-11111111111a' ? 'Delhi Central' : order.source_outlet_id.substring(0, 8)}</td>
                          <td>{order.destination_outlet_id === '11111111-1111-1111-1111-11111111111a' ? 'Delhi Central' : order.destination_outlet_id === '22222222-2222-2222-2222-22222222222b' ? 'Noida Sector 62' : 'Gurgaon Cyber City'}</td>
                          <td>
                            <span className={`premium-badge ${
                              order.status === 'RECEIVED' ? 'badge-success' :
                              order.status === 'DISPATCHED' ? 'badge-info' :
                              order.status === 'CANCELLED' ? 'badge-danger' :
                              'badge-warning'
                            }`}>
                              {order.status}
                            </span>
                          </td>
                          <td>{new Date(order.created_at).toLocaleString()}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {order.status === 'DRAFT' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateTransferStatus(order.id, 'approve')}
                                    className="premium-btn premium-btn-primary"
                                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleUpdateTransferStatus(order.id, 'cancel')}
                                    className="premium-btn premium-btn-danger"
                                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                              {order.status === 'APPROVED' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateTransferStatus(order.id, 'dispatch')}
                                    className="premium-btn premium-btn-primary"
                                    style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'var(--accent-teal)' }}
                                  >
                                    Dispatch
                                  </button>
                                  <button
                                    onClick={() => handleUpdateTransferStatus(order.id, 'cancel')}
                                    className="premium-btn premium-btn-danger"
                                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                              {order.status === 'DISPATCHED' && (
                                <button
                                  onClick={() => handleUpdateTransferStatus(order.id, 'receive')}
                                  className="premium-btn premium-btn-primary"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'var(--success)' }}
                                >
                                  Receive
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
