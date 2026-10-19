import type { Fragrance, ProductDraft } from '../types'
import { getSupabaseClient, isSupabaseConfigured } from './supabase'

type ProductRow = {
  id: string
  name: string
  family: Fragrance['family']
  notes: string
  price: number
  size: string
  tag: string | null
  glass: string
  liquid: string
  cap: string
  backdrop: string
  shape: Fragrance['shape']
  image_url: string | null
  image_path: string | null
  is_active: boolean
  sold_out: boolean
}

function toFragrance(row: ProductRow): Fragrance {
  return {
    id: row.id,
    name: row.name,
    family: row.family,
    notes: row.notes,
    price: Number(row.price),
    size: row.size,
    tag: row.tag ?? undefined,
    glass: row.glass,
    liquid: row.liquid,
    cap: row.cap,
    backdrop: row.backdrop,
    shape: row.shape,
    imageUrl: row.image_url,
    imagePath: row.image_path,
    isActive: row.is_active,
    soldOut: row.sold_out,
  }
}

function toRow(product: ProductDraft) {
  return {
    id: product.id,
    name: product.name.trim(),
    family: product.family,
    notes: product.notes.trim(),
    price: Number(product.price),
    size: product.size.trim(),
    tag: product.tag?.trim() || null,
    glass: product.glass || '#e8cfd2',
    liquid: product.liquid || '#b97880',
    cap: product.cap || '#6B1F3A',
    backdrop: product.backdrop || '#EDE3D7',
    shape: product.shape,
    image_url: product.imageUrl || null,
    image_path: product.imagePath || null,
    is_active: product.isActive !== false,
    sold_out: product.soldOut === true,
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.')
  return result as T
}

function adminHeaders(token: string) {
  return { 'x-kora-admin-token': token }
}

export async function getProducts(activeOnly = true, token = ''): Promise<Fragrance[]> {
  if (isSupabaseConfigured) {
    let query = getSupabaseClient().from('products').select('*').order('name')
    if (activeOnly) query = query.eq('is_active', true)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const products = (data as ProductRow[]).map(toFragrance)
    return activeOnly
      ? products.sort((a, b) => a.id === 'velvet-bloom' ? -1 : b.id === 'velvet-bloom' ? 1 : a.name.localeCompare(b.name))
      : products
  }
  const includeHidden = activeOnly ? '' : '?includeHidden=true'
  const response = await fetch(`/api/products${includeHidden}`, {
    headers: token ? adminHeaders(token) : undefined,
  })
  return readResponse<Fragrance[]>(response)
}

export async function saveProduct(product: ProductDraft, token: string): Promise<Fragrance> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseClient()
    const old = product.id
      ? await supabase.from('products').select('image_path').eq('id', product.id).maybeSingle()
      : { data: null, error: null }
    if (old.error) throw new Error(old.error.message)
    const { data, error } = await supabase.from('products').upsert(toRow(product)).select().single()
    if (error) throw new Error(error.message)
    return toFragrance(data as ProductRow)
  }
  const response = await fetch('/api/products', {
    method: 'PUT',
    headers: { ...adminHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify(product),
  })
  return readResponse<Fragrance>(response)
}

export async function removeProduct(productId: string, token: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseClient()
    const { data: product, error: lookupError } = await supabase.from('products').select('image_path').eq('id', productId).maybeSingle()
    if (lookupError) throw new Error(lookupError.message)
    const { error } = await supabase.from('products').delete().eq('id', productId)
    if (error) throw new Error(error.message)
    if (product?.image_path) await removeUploadedImage(product.image_path, token)
    return
  }
  const response = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
  })
  await readResponse<{ deleted: boolean }>(response)
}

export async function uploadProductImage(file: File, productId: string, token: string) {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }
  const extension = extensions[file.type]
  if (!extension) throw new Error('Choose a JPG, PNG, or WebP image.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.')
  if (isSupabaseConfigured) {
    const imagePath = `${productId}-${crypto.randomUUID()}.${extension}`
    const { error } = await getSupabaseClient().storage.from('product-images').upload(imagePath, file, {
      contentType: file.type,
      upsert: true,
    })
    if (error) throw new Error(error.message)
    const { data } = getSupabaseClient().storage.from('product-images').getPublicUrl(imagePath)
    return { imageUrl: data.publicUrl, imagePath }
  }
  const response = await fetch(`/api/products/${encodeURIComponent(productId)}/photo`, {
    method: 'POST',
    headers: { ...adminHeaders(token), 'content-type': file.type },
    body: file,
  })
  return readResponse<{ imageUrl: string; imagePath: string }>(response)
}

export async function removeUploadedImage(imagePath: string, token: string) {
  if (isSupabaseConfigured) {
    const { error } = await getSupabaseClient().storage.from('product-images').remove([imagePath])
    if (error) throw new Error(error.message)
    return
  }
  const response = await fetch(`/api/uploads/${encodeURIComponent(imagePath)}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
  })
  await readResponse<{ removed: boolean }>(response)
}
