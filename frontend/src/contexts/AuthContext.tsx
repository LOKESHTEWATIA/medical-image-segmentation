import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { User, UserRole } from '../types'
import { authApi } from '../lib/api'
import { getAuthTokens, setAuthTokens, clearAuthTokens, isTokenExpired, refreshAccessToken } from '../lib/authStorage'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (data: Partial<User>) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  hasRole: (...roles: UserRole[]) => boolean
  refreshUser: () => Promise<void>
}

interface RegisterData {
  email: string
  username: string
  password: string
  full_name: string
  institution?: string
  department?: string
  orcid?: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    const { accessToken } = getAuthTokens()
    if (!accessToken || isTokenExpired()) {
      // Try to refresh
      try {
        await refreshAccessToken()
      } catch {
        clearAuthTokens()
        setUser(null)
        setIsLoading(false)
        return
      }
    }

    try {
      const response = await authApi.me()
      setUser(response.data)
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password)
    const { access_token, refresh_token, expires_in, user: userData } = response.data
    setAuthTokens(access_token, refresh_token, expires_in)
    setUser(userData)
  }

  const register = async (data: RegisterData) => {
    const response = await authApi.register(data)
    // Registration doesn't auto-login, user needs to verify email
    return response.data
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore logout errors
    } finally {
      clearAuthTokens()
      setUser(null)
    }
  }

  const updateProfile = async (data: Partial<User>) => {
    const response = await authApi.updateProfile(data)
    setUser(response.data)
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await authApi.changePassword(currentPassword, newPassword)
  }

  const hasRole = (...roles: UserRole[]) => {
    return user ? roles.includes(user.role) : false
  }

  const refreshUser = fetchUser

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
        changePassword,
        hasRole,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}