const ACCESS_TOKEN_KEY = 'medseg_access_token'
const REFRESH_TOKEN_KEY = 'medseg_refresh_token'
const TOKEN_EXPIRY_KEY = 'medseg_token_expiry'

export interface AuthTokens {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
}

export function getAuthTokens(): AuthTokens {
  if (typeof window === 'undefined') {
    return { accessToken: null, refreshToken: null, expiresAt: null }
  }

  return {
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
    expiresAt: parseInt(localStorage.getItem(TOKEN_EXPIRY_KEY) || '0', 10) || null,
  }
}

export function setAuthTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
  if (typeof window === 'undefined') return

  const expiresAt = Date.now() + expiresIn * 1000

  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiresAt.toString())
}

export function clearAuthTokens(): void {
  if (typeof window === 'undefined') return

  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
}

export function isTokenExpired(): boolean {
  const { expiresAt } = getAuthTokens()
  if (!expiresAt) return true
  // Consider token expired 30 seconds before actual expiry
  return Date.now() >= expiresAt - 30000
}

export async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = getAuthTokens()

  if (!refreshToken) {
    throw new Error('No refresh token available')
  }

  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    if (!response.ok) {
      throw new Error('Token refresh failed')
    }

    const data = await response.json()
    setAuthTokens(data.access_token, data.refresh_token, data.expires_in)
    return data.access_token
  } catch (error) {
    clearAuthTokens()
    throw error
  }
}

export function getAuthorizationHeader(): string | null {
  const { accessToken } = getAuthTokens()
  return accessToken ? `Bearer ${accessToken}` : null
}