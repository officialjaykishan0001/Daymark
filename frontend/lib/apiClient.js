// Central fetch wrapper. Set VITE_API_URL in your environment when your backend is ready.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export async function apiClient(path, options = {}) {
  const token = localStorage.getItem('daymark_token')
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...options.headers },
    ...options,
  })
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Something went wrong')
  return response.status === 204 ? null : response.json()
}
