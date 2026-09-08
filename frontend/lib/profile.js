import { apiClient } from './apiClient'

export const profileApi = {
  get: () => apiClient('/profile'),
  update: (data) => apiClient('/profile', { method: 'PUT', body: JSON.stringify(data) }),
}
