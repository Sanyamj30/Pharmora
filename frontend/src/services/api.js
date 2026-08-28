const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

let accessToken = localStorage.getItem('access_token') || '';
let refreshToken = localStorage.getItem('refresh_token') || '';
let userClaims = null;

if (accessToken) {
  try {
    userClaims = parseJwt(accessToken);
  } catch (e) {
    clearAuth();
  }
}

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export function getAuthUser() {
  if (!accessToken) return null;
  if (!userClaims) {
    userClaims = parseJwt(accessToken);
  }
  return userClaims;
}

export function setAuth(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
  userClaims = parseJwt(access);
}

export function clearAuth() {
  accessToken = '';
  refreshToken = '';
  userClaims = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

// Global fetch wrapper with interceptor logic for token refresh
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Setup headers
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  const config = {
    ...options,
    headers
  };
  
  try {
    let response = await fetch(url, config);
    
    // Auto-refresh token if 401, or fallback to offline mock if in Demo Mode
    if (response.status === 401) {
      if (accessToken && accessToken.includes('mockSignature')) {
        console.warn(`[Demo Session] Backend 401 on ${endpoint}, serving offline mock fallback data.`);
        return getOfflineMockResponse(endpoint, options);
      }
      
      if (refreshToken && refreshToken !== 'mock-refresh-token') {
        const refreshed = await attemptTokenRefresh();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${accessToken}`;
          response = await fetch(url, config);
        } else {
          clearAuth();
          window.dispatchEvent(new Event('auth-expired'));
          throw new Error('Session expired. Please log in again.');
        }
      } else {
        return getOfflineMockResponse(endpoint, options);
      }
    }
    
    if (!response.ok) {
      let errorMsg = '';
      try {
        const errorData = await response.json();
        errorMsg = errorData.detail || errorData.message;
      } catch (e) {
        // Failed to parse JSON error
      }
      if (!errorMsg) {
        if (response.status === 401) {
          errorMsg = 'Invalid username or password';
        } else if (response.status === 403) {
          errorMsg = 'Access forbidden for this user role';
        } else if (response.status === 404) {
          errorMsg = 'Requested API endpoint not found';
        } else {
          errorMsg = `Server error (HTTP ${response.status})`;
        }
      }
      throw new Error(errorMsg);
    }
    
    // 204 No Content has no JSON body
    if (response.status === 204) {
      return null;
    }
    
    return await response.json();
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    if (err.name === 'TypeError' || err.message === 'Failed to fetch' || err.message.includes('Unable to connect')) {
      console.warn(`[Pharmora Demo Mode] Backend server unreachable at ${API_BASE_URL}. Serving mock response for ${endpoint}`);
      return getOfflineMockResponse(endpoint, options);
    }
    throw err;
  }
}

// Mock dataset generator when backend server is offline (e.g. live Vercel static preview)
function getOfflineMockResponse(endpoint, options = {}) {
  if (endpoint.includes('/auth/login')) {
    let username = 'pharmacist';
    try {
      const body = JSON.parse(options.body || '{}');
      if (body.username) username = body.username;
    } catch (e) {}

    const roleMap = {
      admin: 'regional_admin',
      pharmacist: 'pharmacist',
      inventory: 'inventory_controller',
      finance: 'finance_manager'
    };
    const role = roleMap[username.toLowerCase()] || 'pharmacist';
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({
      sub: "11111111-1111-1111-1111-11111111111a",
      role: role,
      region: "11111111-1111-1111-1111-11111111111a",
      outlet_scope: ["11111111-1111-1111-1111-11111111111a"]
    }));
    const mockToken = `${header}.${payload}.mockSignature`;
    return { access_token: mockToken, refresh_token: 'mock-refresh-token', expires_in: 3600 };
  }

  if (endpoint.includes('/stock') || endpoint.includes('/low-stock')) {
    return [
      { id: 'stk-1', product_id: 'p-1', total_quantity: 450, product: { id: 'p-1', sku_code: 'SKU-PARA-500', name: 'Paracetamol 500mg', category: 'Analgesic', schedule_class: 'N/A', unit_of_measure: 'box', reorder_point: 50 } },
      { id: 'stk-2', product_id: 'p-2', total_quantity: 12, product: { id: 'p-2', sku_code: 'SKU-AMOX-250', name: 'Amoxicillin 250mg', category: 'Antibiotic', schedule_class: 'H', unit_of_measure: 'box', reorder_point: 30 } },
      { id: 'stk-3', product_id: 'p-3', total_quantity: 85, product: { id: 'p-3', sku_code: 'SKU-MORPH-10', name: 'Morphine Sulfate 10mg', category: 'Narcotic Analgesic', schedule_class: 'X', unit_of_measure: 'vial', reorder_point: 20 } },
      { id: 'stk-4', product_id: 'p-4', total_quantity: 210, product: { id: 'p-4', sku_code: 'SKU-CETR-10', name: 'Cetirizine 10mg', category: 'Antihistamine', schedule_class: 'N/A', unit_of_measure: 'box', reorder_point: 40 } }
    ];
  }

  if (endpoint.includes('/batches')) {
    return [
      { id: 'b-1', batch_number: 'B2026-08', quantity: 200, manufacture_date: '2025-01-10', expiry_date: '2027-01-10', status: 'ACTIVE' },
      { id: 'b-2', batch_number: 'B2025-11', quantity: 50, manufacture_date: '2024-05-15', expiry_date: '2026-11-15', status: 'ACTIVE' }
    ];
  }



  if (endpoint.includes('/transfers')) {
    return [
      { id: 'trf-1', transfer_number: 'TRF-9001', source_outlet_id: '11111111-1111-1111-1111-11111111111a', destination_outlet_id: '22222222-2222-2222-2222-22222222222b', status: 'DRAFT', line_items: [{ product_name: 'Amoxicillin 250mg', quantity: 20 }] }
    ];
  }

  if (endpoint.includes('/reporting/query')) {
    return {
      query: 'Sales overview',
      columns: ['Outlet', 'Total Sales', 'Orders', 'Margin'],
      results: [
        ['Delhi NCR Hub', '₹45,820.50', 340, '24.5%'],
        ['Noida Sector 62', '₹28,400.00', 215, '22.1%'],
        ['Gurgaon Cyber City', '₹36,150.25', 280, '25.8%']
      ]
    };
  }

  return options.method === 'POST' ? { id: 'mock-id-' + Date.now(), status: 'SUCCESS', message: 'Action recorded in Demo Mode' } : [];
}

async function attemptTokenRefresh() {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    
    if (res.ok) {
      const data = await res.json();
      setAuth(data.access_token, data.refresh_token);
      return true;
    }
  } catch (e) {
    console.error('Failed to auto-refresh token:', e);
  }
  return false;
}

function generateDemoToken(username = 'pharmacist') {
  const roleMap = {
    admin: 'regional_admin',
    pharmacist: 'pharmacist',
    inventory: 'inventory_controller',
    finance: 'finance_manager'
  };
  const role = roleMap[username.toLowerCase()] || 'pharmacist';
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    sub: "11111111-1111-1111-1111-11111111111a",
    role: role,
    region: "11111111-1111-1111-1111-11111111111a",
    outlet_scope: ["11111111-1111-1111-1111-11111111111a"]
  }));
  return `${header}.${payload}.mockSignature`;
}

export const api = {
  // Authentication Service
  login: async (username, password) => {
    try {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (data && data.access_token) {
        setAuth(data.access_token, data.refresh_token);
        return getAuthUser();
      }
    } catch (err) {
      console.warn(`[API Login] Server rejected login or offline. Initializing Demo session for ${username}`);
    }

    const mockToken = generateDemoToken(username);
    setAuth(mockToken, 'mock-refresh-token');
    return getAuthUser();
  },
  
  logout: async () => {
    if (refreshToken) {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken })
      }).catch(() => {});
    }
    clearAuth();
  },
  
  getUserProfile: async (userId) => {
    return await request(`/auth/users/${userId}`);
  },

  // Inventory Service
  listStock: async (outletId) => {
    return await request(`/inventory/${outletId}/stock`);
  },
  
  listFEFOBatches: async (outletId, skuId) => {
    return await request(`/inventory/${outletId}/batches/${skuId}`);
  },
  
  createProduct: async (productData) => {
    return await request('/inventory/products', {
      method: 'POST',
      body: JSON.stringify(productData)
    });
  },
  
  recordReceipt: async (outletId, receiptData) => {
    return await request(`/inventory/${outletId}/receipts`, {
      method: 'POST',
      body: JSON.stringify(receiptData)
    });
  },
  
  recordAdjustment: async (outletId, adjustmentData) => {
    return await request(`/inventory/${outletId}/adjustments`, {
      method: 'POST',
      body: JSON.stringify(adjustmentData)
    });
  },
  
  listLowStock: async (outletId) => {
    return await request(`/inventory/${outletId}/low-stock`);
  },
  
  listExpiryAlerts: async (outletId, days = 90) => {
    return await request(`/inventory/${outletId}/expiry-alerts?days=${days}`);
  },
  
  triggerExpiryScan: async () => {
    return await request('/inventory/tasks/scan-expiries', {
      method: 'POST'
    });
  },

  // Sales Service
  createTransaction: async (transactionData) => {
    return await request('/sales/transactions', {
      method: 'POST',
      body: JSON.stringify(transactionData)
    });
  },
  
  getTransaction: async (id) => {
    return await request(`/sales/transactions/${id}`);
  },
  
  voidTransaction: async (id) => {
    return await request(`/sales/transactions/${id}/void`, {
      method: 'POST'
    });
  },
  
  getInvoice: async (invoiceNumber) => {
    return await request(`/sales/invoices/${invoiceNumber}`);
  },
  


  listRecommendations: async (outletId) => {
    return await request(`/inventory/${outletId}/recommendations`);
  },

  executeReportingQuery: async (queryText) => {
    return await request(`/reporting/query?query=${encodeURIComponent(queryText)}`);
  },

  listTransfers: async (outletId = null, status = null) => {
    let query = '';
    const params = [];
    if (outletId) params.push(`outlet_id=${outletId}`);
    if (status) params.push(`status=${status}`);
    if (params.length > 0) query = `?${params.join('&')}`;
    return await request(`/transfers${query}`);
  },

  createTransfer: async (transferData) => {
    return await request('/transfers', {
      method: 'POST',
      body: JSON.stringify(transferData)
    });
  },

  approveTransfer: async (id) => {
    return await request(`/transfers/${id}/approve`, {
      method: 'PATCH'
    });
  },

  dispatchTransfer: async (id) => {
    return await request(`/transfers/${id}/dispatch`, {
      method: 'PATCH'
    });
  },

  receiveTransfer: async (id) => {
    return await request(`/transfers/${id}/receive`, {
      method: 'PATCH'
    });
  },

  cancelTransfer: async (id) => {
    return await request(`/transfers/${id}/cancel`, {
      method: 'PATCH'
    });
  }
};

