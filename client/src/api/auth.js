import api from './client'

export function login(credentials) {
  return api.post('/login', credentials)
}

export function logout() {
  return api.post('/logout')
}

export function session() {
  return api.get('/session')
}
