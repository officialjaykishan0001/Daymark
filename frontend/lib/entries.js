import { apiClient } from './apiClient'

export const entriesApi = {
  list: (params = '') => apiClient(`/entries${params}`),
  get: (id) => apiClient(`/entries/${id}`),
  create: (entry) => apiClient('/entries', { method: 'POST', body: JSON.stringify(entry) }),
  update: (id, entry) => apiClient(`/entries/${id}`, { method: 'PUT', body: JSON.stringify(entry) }),
  remove: (id) => apiClient(`/entries/${id}`, { method: 'DELETE' }),
}
