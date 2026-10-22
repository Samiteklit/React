import type { Fragrance, ProductDraft } from '../types'

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...options })
  const result = await response.json().catch(() => ({ error: 'The collection is temporarily unavailable.' }))
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.')
  return result as T
}
export function getProducts(activeOnly = true): Promise<Fragrance[]> {
  return api(`/api/products${activeOnly ? '' : '?includeHidden=true'}`)
}
export function saveProduct(product: ProductDraft): Promise<Fragrance> {
  return api('/api/products', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(product) })
}
export async function removeProduct(id: string): Promise<void> {
  await api(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
export function uploadProductImage(file: File, id: string) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP photo.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a photo smaller than 5 MB.')
  return api<{ imageUrl: string; imagePath: string }>(`/api/products/${encodeURIComponent(id)}/photo`, { method: 'POST', headers: { 'content-type': file.type }, body: file })
}
export async function removeUploadedImage(path: string) {
  await api(`/api/uploads/${encodeURIComponent(path)}`, { method: 'DELETE' })
}
