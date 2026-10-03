/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)
const CACHED_USER_KEY = 'infraflow_cached_user'

function readCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(CACHED_USER_KEY) || 'null')
  } catch {
    return null
  }
}

function cacheUser(user) {
  if (user) localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user))
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('infraflow_token')
    if (token) {
      api.get('/session')
        .then(r => {
          setUser(r.data.user)
          cacheUser(r.data.user)
        })
        .catch(err => {
          if (err.response?.status === 401) {
            localStorage.removeItem('infraflow_token')
            localStorage.removeItem(CACHED_USER_KEY)
            return
          }
          const cached = readCachedUser()
          if (cached) setUser(cached)
        })
        .finally(() => setLoading(false))
    } else {
      Promise.resolve().then(() => setLoading(false))
    }
  }, [])

  const establishSession = (data) => {
    localStorage.setItem('infraflow_token', data.token)
    cacheUser(data.user)
    setUser(data.user)
    return data
  }

  const login = async (username, password) => {
    const r = await api.post('/login', { username, password })
    return r.data?.twoFactorRequired ? r.data : establishSession(r.data)
  }

  const verifyTwoFactor = async (challengeToken, code) => {
    const r = await api.post('/login/2fa', { challengeToken, code })
    return establishSession(r.data)
  }

  const logout = async () => {
    await api.post('/logout').catch(() => {})
    localStorage.removeItem('infraflow_token')
    localStorage.removeItem(CACHED_USER_KEY)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyTwoFactor, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
