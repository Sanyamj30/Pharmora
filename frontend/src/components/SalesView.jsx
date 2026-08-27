import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useToast } from './Toast';

export default function SalesView({ activeOutlet, triggerRefreshAlerts }) {
  const toast = useToast();
  const [stockList, setStockList] = useState([]);
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  
  // Promo code states
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [promoSuccess, setPromoSuccess] = useState('');

  const [taxRate] = useState(0.12); // 12% standard medical tax rate

  // Current product selection in POS
  const [selectedProdId, setSelectedProdId] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemPrice, setItemPrice] = useState(10.0);
  const [prescriptionRef, setPrescriptionRef] = useState('');

  // Search autocomplete states
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Loyalty states
  const [loyaltyPhone, setLoyaltyPhone] = useState('');
  const [loyaltyProfile, setLoyaltyProfile] = useState(null);
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);

  // Prescription lookup states
  const [prescSearchRef, setPrescSearchRef] = useState('');
  const [activePrescription, setActivePrescription] = useState(null);

  // Active transaction / printable receipt state
  const [activeInvoice, setActiveInvoice] = useState(null);

  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchProducts = async () => {
    if (!activeOutlet) return;
    setLoading(true);
    try {
      const data = await api.listStock(activeOutlet);
      setStockList(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [activeOutlet]);

  const handleAddToCart = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!selectedProdId) {
      setError('Please select a product.');
      return;
    }

    const stockItem = stockList.find(s => s.product_id === selectedProdId);
    if (!stockItem) return;

    if (stockItem.total_quantity < itemQty) {
      setError(`Insufficient overall inventory. Available: ${stockItem.total_quantity} units.`);
      return;
    }

    // Regulated Drug Validation Check
    const isRegulated = stockItem.product.schedule_class === 'H' || stockItem.product.schedule_class === 'X';
    if (isRegulated && !prescriptionRef.trim()) {
      setError(`Compliance Error: SKU ${stockItem.product.sku_code} is a Schedule ${stockItem.product.schedule_class} regulated drug. A valid Prescription Reference is strictly required.`);
      return;
    }

    try {
      // FEFO Batch Auto-Selection Check
      const batches = await api.listFEFOBatches(activeOutlet, selectedProdId);
      const activeBatches = batches.filter(b => b.status === 'ACTIVE');
      if (activeBatches.length === 0) {
        throw new Error('No active batches available for this product.');
      }
      
      // Auto-assign to first expiring active batch (FEFO)
      const selectedBatch = activeBatches[0];
      if (selectedBatch.quantity < itemQty) {
        setError(`Selected FEFO batch #${selectedBatch.batch_number} only has ${selectedBatch.quantity} units remaining. Please adjust quantity.`);
        return;
      }

      const existingCartItem = cart.find(
        (c) => c.product_id === selectedProdId && c.batch_id === selectedBatch.id
      );

      if (existingCartItem) {
        setError('Item already exists in cart. Remove first to adjust.');
        return;
      }

      const cartItem = {
        product_id: selectedProdId,
        product_name: stockItem.product.name,
        sku_code: stockItem.product.sku_code,
        schedule_class: stockItem.product.schedule_class,
        batch_id: selectedBatch.id,
        batch_number: selectedBatch.batch_number,
        quantity: parseInt(itemQty),
        unit_price: parseFloat(itemPrice),
        prescription_ref: prescriptionRef.trim() || null
      };

      setCart([...cart, cartItem]);
      // Reset POS inputs
      setSelectedProdId('');
      setItemQty(1);
      setItemPrice(10.0);
      setPrescriptionRef('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveFromCart = (index) => {
    const updated = [...cart];
    updated.splice(index, 1);
    setCart(updated);
  };

  // Live Invoice Calculations (Property 21)
  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  };

  const calculateDiscount = () => {
    if (!appliedPromo) return 0;
    if (appliedPromo.type === 'percent') {
      return parseFloat(((calculateSubtotal() * appliedPromo.value) / 100).toFixed(2));
    } else if (appliedPromo.type === 'flat') {
      return Math.min(appliedPromo.value, calculateSubtotal());
    }
    return 0;
  };

  const subtotal = calculateSubtotal();
  const calculatedDiscount = calculateDiscount();
  const loyaltyDiscount = useLoyaltyPoints && loyaltyProfile ? parseFloat(Math.min(loyaltyProfile.points * 0.1, subtotal).toFixed(2)) : 0;
  const taxAmount = parseFloat((subtotal * taxRate).toFixed(2));
  const totalAmount = parseFloat(Math.max(0, subtotal + taxAmount - calculatedDiscount - loyaltyDiscount).toFixed(2));

  const handleLoyaltyLookup = (e) => {
    e.preventDefault();
    if (!loyaltyPhone.trim()) {
      setError('Please enter a phone number for loyalty lookup.');
      return;
    }
    setError('');
    // Simulate lookup
    const simulatedPoints = Math.floor(Math.random() * 300) + 50; // 50 to 350
    const names = ["Rahul Sharma", "Priya Patel", "Vikram Singh", "Ananya Iyer", "Amit Gupta"];
    const name = names[Math.floor(Math.random() * names.length)];
    setLoyaltyProfile({
      phone: loyaltyPhone.trim(),
      name,
      points: simulatedPoints,
      tier: simulatedPoints > 200 ? 'Gold Elite' : 'Silver Member'
    });
    setSuccess(`Loyalty profile found for ${name}!`);
  };

  const handleFetchPrescription = async (e) => {
    e.preventDefault();
    if (!prescSearchRef.trim()) {
      setError('Please enter a prescription reference.');
      return;
    }
    setError('');
    setSuccess('');
    try {
      const presc = await api.getPrescription(prescSearchRef.trim());
      if (!presc) {
        setError('Prescription reference not found.');
        return;
      }
      setActivePrescription(presc);
      
      // Auto-populate cart with prescription items
      const newCart = [];
      for (const item of presc.items) {
        // Find matching product in stock list
        const stockItem = stockList.find(s => s.product.sku_code === item.product_sku || s.product_id === item.product_id);
        if (!stockItem) continue;
        
        // Find FEFO batches
        const batches = await api.listFEFOBatches(activeOutlet, stockItem.product_id);
        const activeBatches = batches.filter(b => b.status === 'ACTIVE');
        if (activeBatches.length === 0) continue;
        const selectedBatch = activeBatches[0];
        
        newCart.push({
          product_id: stockItem.product_id,
          product_name: stockItem.product.name,
          sku_code: stockItem.product.sku_code,
          schedule_class: stockItem.product.schedule_class,
          batch_id: selectedBatch.id,
          batch_number: selectedBatch.batch_number,
          quantity: item.quantity,
          unit_price: parseFloat(item.unit_price || 12.5),
          prescription_ref: prescSearchRef.trim()
        });
      }
      setCart(newCart);
      setPrescriptionRef(prescSearchRef.trim());
      setSuccess(`Prescription loaded for patient: ${presc.patient_name || 'N/A'}. Cart populated.`);
    } catch (err) {
      setError(err.message || 'Failed to load prescription.');
    }
  };

  const handleApplyPromo = (e) => {
    e.preventDefault();
    setPromoError('');
    setPromoSuccess('');
    
    if (!promoCode.trim()) {
      setPromoError('Please enter a coupon code.');
      return;
    }

    const upperCode = promoCode.trim().toUpperCase();
    if (upperCode === 'WELCOME10') {
      setAppliedPromo({ code: 'WELCOME10', type: 'percent', value: 10 });
      setPromoSuccess('Promo WELCOME10 applied (10% discount)!');
    } else if (upperCode === 'HEALTH20') {
      setAppliedPromo({ code: 'HEALTH20', type: 'percent', value: 20 });
      setPromoSuccess('Promo HEALTH20 applied (20% discount)!');
    } else if (upperCode === 'LIFESAVER') {
      setAppliedPromo({ code: 'LIFESAVER', type: 'flat', value: 15.0 });
      setPromoSuccess('Promo LIFESAVER applied (₹150.00 flat discount)!');
    } else {
      setPromoError('Invalid promotion or coupon code.');
      setAppliedPromo(null);
    }
  };



  const handleCheckout = async () => {
    setError('');
    setSuccess('');
    if (cart.length === 0) {
      setError('Your shopping cart is empty.');
      return;
    }

    setCheckoutLoading(true);
    try {
      const payload = {
        outlet_id: activeOutlet,
        payment_method: paymentMethod,
        subtotal: subtotal,
        tax_amount: taxAmount,
        discount_amount: parseFloat((calculatedDiscount + loyaltyDiscount).toFixed(2)),
        total_amount: totalAmount,
        line_items: cart.map(item => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          prescription_ref: item.prescription_ref
        }))
      };

      const result = await api.createTransaction(payload);

      // Handle prescription dispensing updates on successful POS checkout
      if (activePrescription && prescriptionRef) {
        const user = api.getAuthUser();
        try {
          await api.dispensePrescription(prescriptionRef, {
            dispensed_by: user ? user.sub : "00000000-0000-0000-0000-000000000000"
          });
        } catch (prescErr) {
          console.error("Prescription dispensing error:", prescErr);
        }
      }

      // Handle loyalty balance updates
      let pointsEarned = Math.floor(subtotal / 10);
      let newBalance = 0;
      if (loyaltyProfile) {
        let finalPoints = loyaltyProfile.points;
        if (useLoyaltyPoints) {
          finalPoints = 0; // used all
        }
        finalPoints += pointsEarned;
        newBalance = finalPoints;
        setLoyaltyProfile({
          ...loyaltyProfile,
          points: finalPoints
        });
      }

      const invoiceData = {
        ...result,
        loyalty_customer: loyaltyProfile ? loyaltyProfile.name : null,
        loyalty_points_earned: pointsEarned,
        loyalty_points_balance: newBalance,
        loyalty_discount: loyaltyDiscount
      };

      setSuccess('Transaction completed successfully! Invoice generated.');
      toast.success(`Transaction #${result.invoice_number || result.id.substring(0, 8)} Completed!`);
      setActiveInvoice(invoiceData);
      
      // Save session sale for dashboard trend
      try {
        const existingSales = JSON.parse(localStorage.getItem('session_sales') || '[]');
        existingSales.push({
          id: result.id,
          total_amount: result.total_amount,
          timestamp: new Date().toISOString()
        });
        localStorage.setItem('session_sales', JSON.stringify(existingSales));
      } catch (e) {
        console.error(e);
      }

      setCart([]);
      setAppliedPromo(null);
      setPromoCode('');
      setUseLoyaltyPoints(false);
      setActivePrescription(null);
      fetchProducts();
      triggerRefreshAlerts();
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleVoidInvoice = async (invoiceId) => {
    setError('');
    setSuccess('');
    try {
      const result = await api.voidTransaction(invoiceId);
      setSuccess(`Invoice ${result.invoice_number} voided and stock released successfully.`);
      setActiveInvoice(result);
      fetchProducts();
      triggerRefreshAlerts();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Page Header */}
      <div>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>POS Terminal Cashier</h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Process sales checkouts, match FEFO batches, verify doctor prescriptions, and generate invoices.
        </p>
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

      {/* Split Billing Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.5fr 1fr',
        gap: '24px',
        alignItems: 'start'
      }}>
        {/* Left Side: Product selection & Cart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Prescription Quick Lookup */}
          <div className="glass-card">
            <h3 style={{ marginBottom: '12px' }}>Verify & Load Doctor Prescription</h3>
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                placeholder="Enter Prescription Reference Code..."
                className="premium-input"
                value={prescSearchRef}
                onChange={(e) => setPrescSearchRef(e.target.value)}
                style={{ flex: 1 }}
              />
              <button 
                type="button" 
                onClick={handleFetchPrescription}
                className="premium-button"
                style={{ padding: '0 20px' }}
              >
                Load Rx
              </button>
            </div>
            {activePrescription && (
              <div style={{
                marginTop: '12px',
                padding: '10px',
                backgroundColor: 'rgba(99, 102, 241, 0.08)',
                borderLeft: '4px solid var(--accent)',
                borderRadius: '4px',
                fontSize: '0.85rem'
              }}>
                <div style={{ fontWeight: 600 }}>Patient: {activePrescription.patient_name}</div>
                <div style={{ color: 'var(--text-secondary)' }}>Doctor: {activePrescription.doctor_name} | Status: {activePrescription.status}</div>
              </div>
            )}
          </div>

          {/* Add Item form */}
          <div className="glass-card">
            <h3 style={{ marginBottom: '16px' }}>Add Item to Cart</h3>
            <form onSubmit={handleAddToCart} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
                <div className="premium-input-container" style={{ position: 'relative' }}>
                  <label className="premium-label">Product Name</label>
                  <input
                    type="text"
                    placeholder="Search SKU or name..."
                    className="premium-input"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                  />
                  {showDropdown && searchQuery && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: '#1f2937',
                      border: '1px solid var(--border-glow)',
                      borderRadius: '8px',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      zIndex: 10,
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)'
                    }}>
                      {stockList
                        .filter(item => 
                          item.product.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.product.sku_code.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map(item => (
                          <div
                            key={item.product_id}
                            onClick={() => {
                              setSelectedProdId(item.product_id);
                              setSearchQuery(`${item.product.name} (${item.product.sku_code})`);
                              setShowDropdown(false);
                            }}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              fontSize: '0.8rem',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(99, 102, 241, 0.15)'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                          >
                            <div style={{ fontWeight: 600 }}>{item.product.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              SKU: {item.product.sku_code} | Stock: {item.total_quantity}
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
                <div className="premium-input-container">
                  <label className="premium-label">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    className="premium-input"
                    value={itemQty}
                    onChange={(e) => setItemQty(e.target.value)}
                  />
                </div>
                <div className="premium-input-container">
                  <label className="premium-label">Unit Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="premium-input"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                  />
                </div>
              </div>

              {/* Show prescription field conditionally if product selected is regulated */}
              {selectedProdId && (
                (() => {
                  const selected = stockList.find(s => s.product_id === selectedProdId);
                  const isRegulated = selected?.product.schedule_class === 'H' || selected?.product.schedule_class === 'X';
                  
                  if (isRegulated) {
                    return (
                      <div className="premium-input-container animate-fade-in" style={{
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px dashed rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        padding: '16px'
                      }}>
                        <label className="premium-label" style={{ color: 'var(--critical)' }}>
                          ⚠️ Regulated Drug: Doctor Prescription Ref Code Required
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. RX-2026-991A"
                          className="premium-input"
                          style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}
                          value={prescriptionRef}
                          onChange={(e) => setPrescriptionRef(e.target.value)}
                        />
                      </div>
                    );
                  }
                  return null;
                })()
              )}

              <button type="submit" className="premium-btn premium-btn-secondary" style={{ width: '100%' }}>
                ➕ Insert Item to Cart
              </button>
            </form>
          </div>

          {/* Cart items list */}
          <div className="glass-card">
            <h3 style={{ marginBottom: '16px' }}>Current Shopping Cart</h3>
            {cart.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: '0.9rem' }}>
                Cart is empty. Select products above to begin billing.
              </p>
            ) : (
              <div className="premium-table-wrapper">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Batch</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                      <th>Prescription</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, index) => (
                      <tr key={index}>
                        <td style={{ fontWeight: 600 }}>{item.product_name}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{item.sku_code}</td>
                        <td>{item.quantity}</td>
                        <td>₹{item.unit_price.toFixed(2)}</td>
                        <td style={{ fontWeight: 'bold' }}>₹{(item.quantity * item.unit_price).toFixed(2)}</td>
                        <td>
                          {item.prescription_ref ? (
                            <span className="premium-badge badge-success" style={{ fontSize: '0.7rem' }}>
                              Ref: {item.prescription_ref}
                            </span>
                          ) : (
                            <span className="premium-badge badge-info" style={{ fontSize: '0.7rem' }}>
                              None
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            onClick={() => handleRemoveFromCart(index)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--critical)',
                              cursor: 'pointer',
                              fontWeight: 'bold'
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Billing Calculator */}
        <div className="glass-card" style={{ position: 'sticky', top: '90px' }}>
          <h3 style={{ marginBottom: '20px' }}>Billing Summary</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Subtotal:</span>
              <span style={{ fontWeight: 600 }}>₹{subtotal.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Tax (12% medical tax):</span>
              <span style={{ fontWeight: 600 }}>₹{taxAmount.toFixed(2)}</span>
            </div>

            {/* Loyalty Lookup & Deductions */}
            <div className="premium-input-container" style={{ gap: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
              <label className="premium-label">⭐ Customer Loyalty Program</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Enter Phone Number..."
                  className="premium-input"
                  value={loyaltyPhone}
                  onChange={(e) => setLoyaltyPhone(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleLoyaltyLookup}
                  className="premium-btn premium-btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  Lookup
                </button>
              </div>

              {loyaltyProfile && (
                <div style={{
                  marginTop: '6px',
                  padding: '8px',
                  backgroundColor: 'rgba(99, 102, 241, 0.05)',
                  border: '1px dashed rgba(99, 102, 241, 0.2)',
                  borderRadius: '6px',
                  fontSize: '0.8rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>{loyaltyProfile.name}</span>
                    <span style={{ color: 'var(--accent)' }}>{loyaltyProfile.tier}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span>Available Points: {loyaltyProfile.points}</span>
                    <span>Value: ₹{(loyaltyProfile.points * 0.1).toFixed(2)}</span>
                  </div>
                  {loyaltyProfile.points > 0 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={useLoyaltyPoints}
                        onChange={(e) => setUseLoyaltyPoints(e.target.checked)}
                      />
                      <span>Redeem points for discount</span>
                    </label>
                  )}
                </div>
              )}
            </div>

            {loyaltyDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', color: 'var(--success)' }}>
                <span>Loyalty Points Discount:</span>
                <span>-₹{loyaltyDiscount.toFixed(2)}</span>
              </div>
            )}


            {/* Promo Code Input & Application System */}
            <div className="premium-input-container" style={{ gap: '6px' }}>
              <label className="premium-label">🎫 Promo Code / Coupon</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="e.g. WELCOME10, HEALTH20"
                  className="premium-input"
                  style={{ textTransform: 'uppercase' }}
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  className="premium-btn premium-btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  Apply
                </button>
              </div>
              
              {promoError && (
                <span style={{ fontSize: '0.8rem', color: 'var(--critical)', marginTop: '2px' }}>
                  ⚠️ {promoError}
                </span>
              )}
              {promoSuccess && (
                <span style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '2px', fontWeight: 500 }}>
                  ✅ {promoSuccess}
                </span>
              )}
            </div>

            {calculatedDiscount > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.95rem',
                color: 'var(--success)',
                background: 'rgba(16, 185, 129, 0.08)',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px dashed rgba(16, 185, 129, 0.2)'
              }}>
                <span>Discount ({appliedPromo?.code}):</span>
                <span style={{ fontWeight: 600 }}>-₹{calculatedDiscount.toFixed(2)}</span>
              </div>
            )}

            <div className="premium-input-container">
              <label className="premium-label">Payment Method</label>
              <select
                className="premium-input"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="CARD">Credit / Debit Card</option>
                <option value="CASH">Cash</option>
                <option value="MOBILE_WALLET">UPI / Mobile Wallet</option>
              </select>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-glow)', margin: '8px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem' }}>
              <span style={{ fontWeight: 'bold' }}>Grand Total:</span>
              <span className="glow-text-primary" style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.4rem' }}>
                ₹{totalAmount.toFixed(2)}
              </span>
            </div>

            <button
              onClick={handleCheckout}
              disabled={checkoutLoading || cart.length === 0}
              className="premium-btn premium-btn-primary"
              style={{
                width: '100%',
                padding: '14px',
                marginTop: '12px',
                background: 'linear-gradient(135deg, var(--primary), var(--accent-teal))'
              }}
            >
              {checkoutLoading ? 'Processing Checkout...' : '💵 Confirm Payment & Print'}
            </button>
          </div>
        </div>
      </div>

      {/* Printable Receipt modal view if invoice generated */}
      {activeInvoice && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '24px'
        }}>
          <div className="glass-card animate-fade-in" style={{
            maxWidth: '550px',
            width: '100%',
            background: '#ffffff',
            color: '#1e293b',
            borderRadius: '12px',
            padding: '32px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.9)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            {/* Header print area */}
            <div style={{ textAlign: 'center', borderBottom: '2px dashed #cbd5e1', paddingBottom: '16px', marginBottom: '20px' }}>
              <h2 style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.5rem', marginBottom: '4px' }}>PHARMORA</h2>
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Delhi NCR Healthcare Outlet</p>
              <h3 style={{ color: '#0284c7', fontSize: '1rem', marginTop: '10px', textTransform: 'uppercase', fontWeight: 700 }}>
                {activeInvoice.status} RECEIPT
              </h3>
            </div>

            {/* Meta details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem', color: '#475569', marginBottom: '20px' }}>
              <div>
                <strong>Invoice Number:</strong> {activeInvoice.invoice_number}
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong>Date:</strong> {new Date().toLocaleString()}
              </div>
              <div>
                <strong>Outlet ID:</strong> {activeInvoice.outlet_id.substring(0, 8)}...
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong>Pharmacist ID:</strong> {activeInvoice.pharmacist_id.substring(0, 8)}...
              </div>
            </div>

            {/* Line items table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem', marginBottom: '24px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 0', color: '#1e293b' }}>Description</th>
                  <th style={{ padding: '8px 0', color: '#1e293b', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '8px 0', color: '#1e293b', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '8px 0', color: '#1e293b', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {activeInvoice.line_items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 0', color: '#334155' }}>
                      {item.product?.name || `Product ID: ${item.product_id.substring(0, 8)}`}
                      <br />
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Batch: #{item.batch_number || 'AUTO'}</span>
                    </td>
                    <td style={{ padding: '8px 0', textAlign: 'center', color: '#334155' }}>{item.quantity}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', color: '#334155' }}>₹{item.unit_price.toFixed(2)}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                      ₹{(item.quantity * item.unit_price).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals math */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '2px dashed #cbd5e1', paddingTop: '16px', fontSize: '0.9rem', color: '#334155', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <span>₹{activeInvoice.subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Tax:</span>
                <span>₹{activeInvoice.tax_amount.toFixed(2)}</span>
              </div>
              {activeInvoice.discount_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c' }}>
                  <span>Discount:</span>
                  <span>-₹{activeInvoice.discount_amount.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', color: '#0f172a', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                <span>Total Paid:</span>
                <span>₹{activeInvoice.total_amount.toFixed(2)}</span>
              </div>
            </div>

            {/* Loyalty Details inside Receipt */}
            {activeInvoice.loyalty_customer && (
              <div style={{ 
                margin: '-12px 0 20px 0', 
                padding: '12px', 
                backgroundColor: '#f8fafc', 
                border: '1px solid #e2e8f0', 
                borderRadius: '8px',
                fontSize: '0.85rem',
                color: '#334155'
              }}>
                <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}>⭐ Loyalty Rewards Program</div>
                <div>Customer Name: {activeInvoice.loyalty_customer}</div>
                <div>Points Earned on Sale: +{activeInvoice.loyalty_points_earned}</div>
                <div>New Points Balance: {activeInvoice.loyalty_points_balance}</div>
                {activeInvoice.loyalty_discount > 0 && (
                  <div style={{ color: '#059669', fontWeight: 600, marginTop: '4px' }}>Points Redeemed Discount: -₹{activeInvoice.loyalty_discount.toFixed(2)}</div>
                )}
              </div>
            )}

            {/* Actions button area */}
            <div style={{ display: 'flex', gap: '12px' }} className="no-print">
              <button onClick={handlePrint} className="premium-btn premium-btn-primary" style={{ flex: 1 }}>
                🖨️ Print Invoice
              </button>
              
              {activeInvoice.status === 'COMPLETED' && (
                <button 
                  onClick={() => handleVoidInvoice(activeInvoice.id)} 
                  className="premium-btn premium-btn-danger" 
                  style={{ flex: 1 }}
                >
                  Void Sale (Return Stock)
                </button>
              )}
              
              <button 
                onClick={() => setActiveInvoice(null)} 
                className="premium-btn premium-btn-secondary" 
                style={{ flex: 1, color: '#0f172a' }}
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
