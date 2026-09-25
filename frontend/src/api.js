import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('/api/certificates', '')
  : 'http://localhost:5000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// Attach JWT token to every request if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('certifychain_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Retry once on network error (masks cold-start first-use failures)
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config || {};
    if (!err.response && !config._retried) {
      config._retried = true;
      await new Promise((r) => setTimeout(r, 1200));
      return api(config);
    }

    // Normalize error for UI consumption
    if (!err.response) {
      err.response = {
        data: {
          error: "NETWORK_ERROR",
          message: "Could not reach the server. Please check your connection."
        }
      };
    } else if (err.response.status >= 500) {
      err.response.data = err.response.data || {};
      if (!err.response.data.message && !err.response.data.error) {
        err.response.data.message = `An unexpected server error occurred (${err.response.status}).`;
      }
    }

    return Promise.reject(err);
  }
);

export default api;

// ── Auth helpers ──────────────────────────────────────────────────────────
export const authApi = {
  sendOtp: (email) => api.post('/api/auth/send-otp', { email }),
  verifyOtp: (email, otp) => api.post('/api/auth/verify-otp', { email, otp }),
  register: (data) => api.post('/api/auth/register', data),

  // Combined: verify OTP first, then register the user
  signup: async (formData, otp) => {
    // First verify the OTP
    await api.post('/api/auth/verify-otp', {
      email: formData.email,
      otp,
    });
    // Then register
    return api.post('/api/auth/register', formData);
  },

  login: (identifier, password, role) => api.post('/api/auth/login', { identifier, password, role }),
  checkEmail: (email) => api.get('/api/auth/check-email', { params: { email } }),
  googleAuth: (credential, role, inviteCode, isLogin = false) => api.post('/api/auth/google', { credential, role, inviteCode, isLogin }),
};

// ── History helpers ───────────────────────────────────────────────────────
export const historyApi = {
  addHistory: (data) => api.post('/api/history', data),
  getHistory: () => api.get('/api/history'),
};

// ── Certificate Stats helpers ────────────────────────────────────────────────
export const statsApi = {
  getAdminStats: () => api.get('/api/certificates/admin-stats'),
  getStudentStats: () => api.get('/api/certificates/student-stats'),
};

// ── AI training helpers (admin) ───────────────────────────────────────────
// Proxy through the backend to the AI service's known-organization registry,
// which the AI uses to resolve institution names printed inside/under logos.
export const trainingApi = {
  list: () => api.get('/api/ai/organizations'),
  train: (data) => api.post('/api/ai/organizations/train', data),
  untrain: (name) => api.delete(`/api/ai/organizations/${encodeURIComponent(name)}`),
};
