import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      // Screen 1: does this username/email have more than one role?
      identifyLogin: async (identifier) => {
        const response = await api.post('/auth/login/identify', { identifier })
        return response.data.data
      },

      // Resolves to { requiresRoleSelection: true, roles } when the username matches
      // several accounts; call again with the chosen role to finish signing in.
      login: async (username, password, role) => {
        const response = await api.post('/auth/login', {
          username,
          password,
          ...(role ? { role } : {})
        })

        if (response.data.data?.requiresRoleSelection) {
          return response.data.data
        }

        const { token, user } = response.data.data
        set({ user, token, isAuthenticated: true })
        return { requiresRoleSelection: false, user }
      },

      register: async (userData) => {
        const response = await api.post('/auth/register', userData)
        return response.data
      },

      // Resolves to { requiresAccountSelection: true, accounts } when the email is
      // used by several accounts; call again with the chosen role.
      forgotPassword: async (email, role) => {
        const response = await api.post('/auth/forgot-password', {
          email,
          ...(role ? { role } : {})
        })
        return response.data.data
      },

      resetPassword: async (resetToken, newPassword) => {
        const response = await api.post('/auth/reset-password', { resetToken, newPassword })
        return response.data
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
      },

      updateUser: (userData) => {
        set({ user: { ...get().user, ...userData } })
      },

      getProfile: async () => {
        const response = await api.get('/auth/me')
        set({ user: response.data.data })
        return response.data.data
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
)
