import type { Config } from '@netlify/functions'
import { getUser } from '@netlify/identity'
import { getStore } from '@netlify/blobs'
import { eq, asc } from 'drizzle-orm'
import { database } from '../../db/index.js'
import { products } from '../../db/schema.js'

function fail(status: number, message: string): never { throw new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) }
async function requireAdmin() {
  const user = await getUser()
  if (!user) fail(401, 'Please sign in to the KORA studio.')
  if (!user.roles?.includes('admin')) fail(403, 'This account needs the admin role to manage the KORA collection.')
}
function images() { return getStore({ name: 'kora-product-images', consistency: 'strong' }) }
function validKey(key: string) { return /^[a-z0-9-]+\.(jpg|png|webp)$/.test(key) }

export default async (req: Request) => {
  try {
    const url = new URL(req.url)
    const path = url.pathname
    const method = req.method
    if (path.startsWith('/uploads/') && method === 'GET') {
      const key = decodeURIComponent(path.slice(9))
      if (!validKey(key)) fail(404, 'Photo not found.')
      const data = await images().get(key, { type: 'arrayBuffer' })
      if (!data) fail(404, 'Photo not found.')
      const ext = key.split('.').pop()
      return new Response(data, { headers: { 'content-type': ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } })
    }
    if (path === '/api/admin/session' && method === 'GET') {
      await requireAdmin()
      return Response.json({ signedIn: true }, { headers: { 'cache-control': 'no-store' } })
    }
    if (path === '/api/products' && method === 'GET') {
      const hidden = url.searchParams.get('includeHidden') === 'true'
      if (hidden) await requireAdmin()
      const db = database()
      const rows = await db.select().from(products).where(hidden ? undefined : eq(products.isActive, true)).orderBy(asc(products.name))
      if (!hidden) rows.sort((a, b) => a.id === 'velvet-bloom' ? -1 : b.id === 'velvet-bloom' ? 1 : a.name.localeCompare(b.name))
      return Response.json(rows, { headers: { 'cache-control': 'no-store' } })
    }
    await requireAdmin()
    if (method !== 'GET' && req.headers.get('origin') && req.headers.get('origin') !== url.origin) fail(403, 'Please make changes from the KORA website.')
    if (path === '/api/products' && method === 'PUT') {
      const p = await req.json().catch(() => fail(400, 'Send valid product information.'))
      if (!p || typeof p.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)
        || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200
        || !['Floral', 'Woody', 'Fresh', 'Amber'].includes(p.family)
        || typeof p.notes !== 'string' || typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0
        || !['5 ml', '10 ml', '30 ml', '50 ml', '100 ml'].includes(p.size)
        || !['square', 'round', 'slim'].includes(p.shape)
        || ['isActive', 'soldOut'].some(k => p[k] !== undefined && typeof p[k] !== 'boolean')
        || ['glass', 'liquid', 'cap', 'backdrop'].some(k => typeof p[k] !== 'string' || !/^#[0-9a-f]{6}$/i.test(p[k]))
        || (p.tag != null && typeof p.tag !== 'string')
        || (p.imagePath != null && (typeof p.imagePath !== 'string' || !validKey(p.imagePath)))
        || (p.imageUrl != null && p.imageUrl !== `/uploads/${p.imagePath}`)) fail(400, 'Check the name, family, price, size, and product details.')
      const values = { id: p.id, name: p.name.trim(), family: p.family, notes: p.notes.trim(), price: p.price, size: p.size, tag: p.tag?.trim() || null, glass: p.glass, liquid: p.liquid, cap: p.cap, backdrop: p.backdrop, shape: p.shape, imageUrl: p.imagePath ? `/uploads/${p.imagePath}` : null, imagePath: p.imagePath || null, isActive: p.isActive !== false, soldOut: p.soldOut === true, updatedAt: new Date() }
      const [saved] = await database().insert(products).values(values).onConflictDoUpdate({ target: products.id, set: values }).returning()
      return Response.json(saved, { headers: { 'cache-control': 'no-store' } })
    }
    const photo = path.match(/^\/api\/products\/([a-z0-9-]+)\/photo$/)
    if (photo && method === 'POST') {
      const type = req.headers.get('content-type')?.split(';')[0]
      const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : null
      if (!ext) fail(415, 'Choose a JPG, PNG, or WebP photo.')
      if (Number(req.headers.get('content-length')) > 5 * 1024 * 1024) fail(413, 'Choose a photo smaller than 5 MB.')
      const body = await req.arrayBuffer()
      if (!body.byteLength || body.byteLength > 5 * 1024 * 1024) fail(413, 'Choose a photo smaller than 5 MB.')
      const bytes = new Uint8Array(body)
      const valid = ext === 'jpg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : ext === 'png' ? bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10' : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
      if (!valid) fail(415, 'The photo does not match its file type.')
      const key = `${photo[1]}-${crypto.randomUUID()}.${ext}`
      await images().set(key, body)
      return Response.json({ imageUrl: `/uploads/${key}`, imagePath: key }, { status: 201 })
    }
    const upload = path.match(/^\/api\/uploads\/([^/]+)$/)
    if (upload && method === 'DELETE') {
      const key = decodeURIComponent(upload[1])
      if (!validKey(key)) fail(400, 'Invalid photo path.')
      await images().delete(key)
      return Response.json({ removed: true })
    }
    const product = path.match(/^\/api\/products\/([a-z0-9-]+)$/)
    if (product && method === 'DELETE') {
      const [removed] = await database().delete(products).where(eq(products.id, product[1])).returning()
      if (!removed) fail(404, 'That fragrance could not be found.')
      if (removed.imagePath) await images().delete(removed.imagePath)
      return Response.json({ deleted: true })
    }
    fail(404, 'That endpoint could not be found.')
  } catch (error) {
    if (error instanceof Response) return error
    return Response.json({ error: 'The collection is temporarily unavailable. Please try again.' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
export const config: Config = { path: ['/api/*', '/uploads/*'] }
