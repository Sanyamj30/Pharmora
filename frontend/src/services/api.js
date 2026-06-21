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
    
    // Auto-refresh token if 401 and refresh token exists
    if (response.status === 401 && refreshToken) {
      const refreshed = await attemptTokenRefresh();
      if (refreshed) {
        // Retry original request with new token
        headers['Authorization'] = `Bearer ${accessToken}`;
        response = await fetch(url, config);
      } else {
        clearAuth();
        window.dispatchEvent(new Event('auth-expired'));
        throw new Error('Session expired. Please log in again.');
      }
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.detail || errorData.message || 'Request failed';
      throw new Error(errorMsg);
    }
    
    // 204 No Content has no JSON body
    if (response.status === 204) {
      return null;
    }
    
    return await response.json();
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
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

export const api = {
  // Authentication Service
  login: async (username, password) => {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setAuth(data.access_token, data.refresh_token);
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
  
  registerPrescription: async (prescriptionData) => {
    return await request('/sales/prescriptions', {
      method: 'POST',
      body: JSON.stringify(prescriptionData)
    });
  },
  
  getPrescription: async (ref) => {
    return await request(`/sales/prescriptions/${ref}`);
  },
  
  dispensePrescription: async (ref, dispenseData) => {
    return await request(`/sales/prescriptions/${ref}/dispense`, {
      method: 'POST',
      body: JSON.stringify(dispenseData)
    });
  },
  
  listPrescriptions: async () => {
    return await request('/sales/prescriptions');
  },
  
  listOverrides: async () => {
    return await request('/sales/overrides');
  },
  
  createOverride: async (overrideData) => {
    return await request('/sales/overrides', {
      method: 'POST',
      body: JSON.stringify(overrideData)
    });
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

