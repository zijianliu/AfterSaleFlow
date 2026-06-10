const API_BASE = 'http://localhost:3000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

function setCurrentUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const token = getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    throw new Error(data.error || `请求失败: ${response.status}`);
  }
  
  return data;
}

const api = {
  login(username, password) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  adminLogin(username, password) {
    return request('/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },
  
  getMe() {
    return request('/auth/me');
  },
  
  getOrders(status) {
    const url = status ? `/orders?status=${status}` : '/orders';
    return request(url);
  },
  
  getOrderDetail(id) {
    return request(`/orders/${id}`);
  },
  
  getOrderItems(orderId) {
    return request(`/orders/${orderId}/items`);
  },
  
  createAfterSale(orderId, type, reason, images, items) {
    return request('/after-sale', {
      method: 'POST',
      body: JSON.stringify({ orderId, type, reason, images, items })
    });
  },
  
  getAfterSaleList(status, type) {
    let url = '/after-sale';
    const params = [];
    if (status) params.push(`status=${status}`);
    if (type) params.push(`type=${type}`);
    if (params.length) url += '?' + params.join('&');
    return request(url);
  },
  
  getAfterSaleDetail(id) {
    return request(`/after-sale/${id}`);
  },
  
  reviewAfterSale(id, approved, rejectReason) {
    return request(`/after-sale/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ approved, rejectReason })
    });
  },
  
  submitReturnLogistics(id, logisticsNo, logisticsCompany) {
    return request(`/after-sale/${id}/return-logistics`, {
      method: 'POST',
      body: JSON.stringify({ logisticsNo, logisticsCompany })
    });
  },
  
  confirmReturnReceive(id, receivedItems) {
    return request(`/after-sale/${id}/confirm-receive`, {
      method: 'POST',
      body: JSON.stringify({ receivedItems })
    });
  },
  
  handleDifference(id, differenceItemIds, action) {
    return request(`/after-sale/${id}/handle-difference`, {
      method: 'POST',
      body: JSON.stringify({ differenceItemIds, action })
    });
  },
  
  exchangeOutbound(id, exchangeProductId, logisticsNo, logisticsCompany) {
    return request(`/after-sale/${id}/exchange-outbound`, {
      method: 'POST',
      body: JSON.stringify({ exchangeProductId, logisticsNo, logisticsCompany })
    });
  },
  
  convertToRefund(id) {
    return request(`/after-sale/${id}/convert-to-refund`, {
      method: 'POST'
    });
  },
  
  cancelAfterSale(id) {
    return request(`/after-sale/${id}/cancel`, {
      method: 'POST'
    });
  },
  
  completeAfterSale(id) {
    return request(`/after-sale/${id}/complete`, {
      method: 'POST'
    });
  },
  
  retryRefund(id) {
    return request(`/after-sale/${id}/retry-refund`, {
      method: 'POST'
    });
  },

  processRefund(id) {
    return request(`/after-sale/${id}/process-refund`, {
      method: 'POST'
    });
  },
  
  getRefundList(status) {
    const url = status ? `/after-sale/refunds/list?status=${status}` : '/after-sale/refunds/list';
    return request(url);
  },
  
  getInventoryList() {
    return request('/after-sale/inventory/list');
  },
  
  getInventoryLogs(productId) {
    const url = productId ? `/after-sale/inventory/logs?productId=${productId}` : '/after-sale/inventory/logs';
    return request(url);
  },
  
  getProducts() {
    return request('/after-sale/products/all');
  },
  
  getWarehouses() {
    return request('/after-sale/warehouses/all');
  }
};

const AfterSaleStatus = {
  PENDING_REVIEW: 'pending_review',
  REJECTED: 'rejected',
  PENDING_RETURN: 'pending_return',
  PENDING_RECEIVE: 'pending_receive',
  PENDING_REFUND: 'pending_refund',
  REFUNDING: 'refunding',
  REFUND_SUCCESS: 'refund_success',
  REFUND_FAILED: 'refund_failed',
  PENDING_EXCHANGE_OUTBOUND: 'pending_exchange_outbound',
  EXCHANGE_OUTBOUND: 'exchange_outbound',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  PENDING_DIFFERENCE: 'pending_difference'
};

const AfterSaleType = {
  REFUND_ONLY: 'refund_only',
  RETURN_REFUND: 'return_refund',
  EXCHANGE: 'exchange'
};

const UserRole = {
  CUSTOMER: 'customer',
  CS_AGENT: 'cs_agent',
  WAREHOUSE_STAFF: 'warehouse_staff',
  FINANCE_STAFF: 'finance_staff',
  ADMIN: 'admin'
};

const statusLabels = {
  pending_review: '待审核',
  rejected: '已拒绝',
  pending_return: '待用户退货',
  pending_receive: '待仓库收货',
  pending_refund: '待退款',
  refunding: '退款中',
  refund_success: '退款成功',
  refund_failed: '退款失败',
  pending_exchange_outbound: '待换货出库',
  exchange_outbound: '换货已出库',
  completed: '已完成',
  cancelled: '已取消',
  pending_difference: '待差异处理'
};

const typeLabels = {
  refund_only: '仅退款',
  return_refund: '退货退款',
  exchange: '换货'
};

const roleLabels = {
  customer: '用户',
  cs_agent: '客服',
  warehouse_staff: '仓库人员',
  finance_staff: '财务',
  admin: '管理员'
};

const statusClassMap = {
  pending_review: 'tag-pending',
  rejected: 'tag-rejected',
  pending_return: 'tag-processing',
  pending_receive: 'tag-processing',
  pending_refund: 'tag-processing',
  refunding: 'tag-processing',
  refund_success: 'tag-success',
  refund_failed: 'tag-failed',
  pending_exchange_outbound: 'tag-pending',
  exchange_outbound: 'tag-approved',
  completed: 'tag-success',
  cancelled: 'tag-cancelled',
  pending_difference: 'tag-pending'
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatMoney(amount) {
  return `¥${Number(amount).toFixed(2)}`;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    z-index: 2000;
    animation: slideDown 0.3s ease;
  `;
  
  if (type === 'success') toast.style.background = '#52c41a';
  else if (type === 'error') toast.style.background = '#ff4d4f';
  else if (type === 'warning') toast.style.background = '#faad14';
  else toast.style.background = '#4a90d9';
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown {
    from { opacity: 0; transform: translate(-50%, -20px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  @keyframes slideUp {
    from { opacity: 1; transform: translate(-50%, 0); }
    to { opacity: 0; transform: translate(-50%, -20px); }
  }
`;
document.head.appendChild(style);

function checkAuth(redirectUrl) {
  const token = getToken();
  if (!token) {
    window.location.href = redirectUrl || '/frontend/login.html';
    return false;
  }
  return true;
}

function checkRole(allowedRoles, redirectUrl) {
  const user = getCurrentUser();
  if (!user || !allowedRoles.includes(user.role)) {
    showToast('无权访问该页面', 'error');
    setTimeout(() => {
      window.location.href = redirectUrl || '/frontend/login.html';
    }, 1000);
    return false;
  }
  return true;
}

function logout() {
  clearToken();
  window.location.href = '/frontend/login.html';
}
