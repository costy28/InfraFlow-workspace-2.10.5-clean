import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
})

// Interceptor: adauga token din localStorage la fiecare cerere
api.interceptors.request.use(config => {
  const token = localStorage.getItem('infraflow_token')
  if (token) config.headers.Authorization = 'Bearer ' + token
  return config
})

// Interceptor: la 401 -> redirect la login
api.interceptors.response.use(
  res => res,
  err => {
    const requestUrl = String(err.config?.url || '').replace(/\/+$/, '')
    const isPublicAuthRequest = requestUrl === '/login' || requestUrl.startsWith('/setup/')
    if (err.response?.status === 401 && !isPublicAuthRequest) {
      localStorage.removeItem('infraflow_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
