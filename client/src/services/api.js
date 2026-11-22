import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Endpoints reached while signing in or recovering an account. A 401 from these means
// "those credentials were wrong", not "your session expired", so it must be handed back
// to the page instead of triggering a logout and a redirect to /login — which would
// otherwise wipe the multi-step login form mid-flow.
const CREDENTIAL_ENDPOINTS = [
  '/auth/login',
  '/auth/login/identify',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password'
]

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const isCredentialAttempt = CREDENTIAL_ENDPOINTS.some((path) => url.startsWith(path))

    // A 401 on a normal request means the stored session is no longer usable —
    // expired or revoked. Clear it and send the user to sign in, rather than
    // leaving a logged-in-looking app whose every list comes back empty.
    if (error.response?.status === 401 && !isCredentialAttempt) {
      const { isAuthenticated, logout } = useAuthStore.getState()
      if (isAuthenticated) {
        logout()
        // Survives the full page load so the login screen can explain why
        sessionStorage.setItem('session-expired', '1')
      }
      if (window.location.pathname !== '/login') window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
