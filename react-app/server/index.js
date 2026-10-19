import { createServer as createHttpServer } from 'node:http'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { basename, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dataDirectory = process.env.KORA_DATA_DIR ? resolve(process.env.KORA_DATA_DIR) : join(projectRoot, 'data')
const uploadsDirectory = join(dataDirectory, 'uploads')
const databaseFile = join(dataDirectory, 'kora.sqlite')
const distDirectory = join(projectRoot, 'dist')
const isProduction = process.argv.includes('--production')
const port = Number(process.env.PORT || 5173)
const uploadLimit = 5 * 1024 * 1024
const mimeExtensions = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
])
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
])

await mkdir(uploadsDirectory, { recursive: true })

const database = new DatabaseSync(databaseFile)
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    family TEXT NOT NULL CHECK (family IN ('Floral', 'Woody', 'Fresh', 'Amber')),
    notes TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL CHECK (price >= 0),
    size TEXT NOT NULL DEFAULT '50 ml',
    tag TEXT,
    glass TEXT NOT NULL DEFAULT '#e8cfd2',
    liquid TEXT NOT NULL DEFAULT '#b97880',
    cap TEXT NOT NULL DEFAULT '#6B1F3A',
    backdrop TEXT NOT NULL DEFAULT '#EDE3D7',
    shape TEXT NOT NULL DEFAULT 'square' CHECK (shape IN ('square', 'round', 'slim')),
    image_url TEXT,
    image_path TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    sold_out INTEGER NOT NULL DEFAULT 0 CHECK (sold_out IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

const productColumns = database.prepare('PRAGMA table_info(products)').all()
if (!productColumns.some((column) => column.name === 'sold_out')) {
  database.exec('ALTER TABLE products ADD COLUMN sold_out INTEGER NOT NULL DEFAULT 0 CHECK (sold_out IN (0, 1))')
}

const starterProducts = [
  ['velvet-bloom', 'Velvet Bloom', 'Floral', 'Rose · pink pepper · musk', 86, '50 ml', 'Bestseller', '#e8cfd2', '#b97880', '#6B1F3A', '#EDE3D7', 'square'],
  ['cedar-veil', 'Cedar Veil', 'Woody', 'Cedarwood · fig · sandalwood', 92, '50 ml', 'New', '#e2d6c9', '#a88f72', '#B08D57', '#E5D9CC', 'slim'],
  ['citrus-hour', 'Citrus Hour', 'Fresh', 'Bergamot · neroli · green tea', 78, '50 ml', null, '#f1e8d4', '#c3a66e', '#A88A5A', '#F3EBDD', 'round'],
  ['amber-muse', 'Amber Muse', 'Amber', 'Vanilla · amber · tonka bean', 98, '50 ml', null, '#e8d5c4', '#b08d57', '#6B1F3A', '#EDE3D7', 'square'],
  ['soft-focus', 'Soft Focus', 'Floral', 'Peony · pear · white musk', 82, '50 ml', null, '#eadbd5', '#c89a92', '#8B7968', '#F2E6E3', 'round'],
  ['after-rain', 'After the Rain', 'Fresh', 'Moss · mint · clean musk', 80, '50 ml', null, '#e0d8d0', '#9d8774', '#3D1125', '#E7E2DC', 'slim'],
]
const seedProduct = database.prepare(`
  INSERT OR IGNORE INTO products
  (id, name, family, notes, price, size, tag, glass, liquid, cap, backdrop, shape)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
for (const product of starterProducts) seedProduct.run(...product)

let activeAdminToken = ''
let adminTokenExpiresAt = 0
let vite = null

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function fail(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  throw error
}

async function readBody(request, limit = 1024 * 1024) {
  const parts = []
  let size = 0
  for await (const part of request) {
    size += part.length
    if (size > limit) fail(413, 'That request is too large.')
    parts.push(part)
  }
  return Buffer.concat(parts)
}

async function readJson(request) {
  const body = await readBody(request)
  try {
    return JSON.parse(body.toString('utf8'))
  } catch {
    fail(400, 'Please send valid form information.')
  }
}

function productFromRow(row) {
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
    isActive: Boolean(row.is_active),
    soldOut: Boolean(row.sold_out),
  }
}

function listProducts(activeOnly) {
  const rows = activeOnly
    ? database.prepare("SELECT * FROM products WHERE is_active = 1 ORDER BY CASE id WHEN 'velvet-bloom' THEN 0 ELSE 1 END, name").all()
    : database.prepare('SELECT * FROM products ORDER BY name').all()
  return rows.map(productFromRow)
}

function isAdminConfigured() {
  return Boolean(database.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get())
}

function requireAdmin(request) {
  const token = request.headers['x-kora-admin-token']
  if (!token || token !== activeAdminToken || Date.now() > adminTokenExpiresAt) {
    activeAdminToken = ''
    adminTokenExpiresAt = 0
    fail(401, 'Please sign in to the KORA admin.')
  }
}

function makeSession(response) {
  activeAdminToken = randomBytes(32).toString('hex')
  adminTokenExpiresAt = Date.now() + 12 * 60 * 60 * 1000
  sendJson(response, 200, { token: activeAdminToken })
}

function storeAdminPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  const encoded = `${salt.toString('hex')}:${hash.toString('hex')}`
  database.prepare("INSERT INTO settings (key, value) VALUES ('admin_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(encoded)
}

function storeAdminUsername(username) {
  database.prepare("INSERT INTO settings (key, value) VALUES ('admin_username', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(username)
}

function verifyAdminUsername(username) {
  const stored = database.prepare("SELECT value FROM settings WHERE key = 'admin_username'").get()?.value
  return typeof username === 'string' && username === stored
}

function verifyAdminPassword(password) {
  const stored = database.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get()?.value
  if (!stored) return false
  const [saltHex, expectedHex] = stored.split(':')
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function validProduct(product) {
  return product
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.id)
    && typeof product.name === 'string' && product.name.trim().length > 0
    && ['Floral', 'Woody', 'Fresh', 'Amber'].includes(product.family)
    && typeof product.notes === 'string'
    && Number.isFinite(Number(product.price)) && Number(product.price) >= 0
    && ['5 ml', '10 ml', '30 ml', '50 ml', '100 ml'].includes(product.size)
    && ['square', 'round', 'slim'].includes(product.shape)
    && (product.soldOut === undefined || typeof product.soldOut === 'boolean')
}

async function saveProduct(request, response) {
  requireAdmin(request)
  const product = await readJson(request)
  if (!validProduct(product)) fail(400, 'Check the name, family, price, size, and product details.')

  const oldRow = database.prepare('SELECT image_path FROM products WHERE id = ?').get(product.id)
  const imagePath = product.imagePath || null
  database.prepare(`
    INSERT INTO products
      (id, name, family, notes, price, size, tag, glass, liquid, cap, backdrop, shape, image_url, image_path, is_active, sold_out)
    VALUES
      (@id, @name, @family, @notes, @price, @size, @tag, @glass, @liquid, @cap, @backdrop, @shape, @imageUrl, @imagePath, @isActive, @soldOut)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, family = excluded.family, notes = excluded.notes,
      price = excluded.price, size = excluded.size, tag = excluded.tag,
      glass = excluded.glass, liquid = excluded.liquid, cap = excluded.cap,
      backdrop = excluded.backdrop, shape = excluded.shape, image_url = excluded.image_url,
      image_path = excluded.image_path, is_active = excluded.is_active, sold_out = excluded.sold_out,
      updated_at = CURRENT_TIMESTAMP
  `).run({
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
    imageUrl: product.imageUrl || null,
    imagePath,
    isActive: product.isActive === false ? 0 : 1,
    soldOut: product.soldOut === true ? 1 : 0,
  })
  if (oldRow?.image_path && oldRow.image_path !== imagePath) await removeUploadedFile(oldRow.image_path)
  const saved = database.prepare('SELECT * FROM products WHERE id = ?').get(product.id)
  sendJson(response, 200, productFromRow(saved))
}

async function removeUploadedFile(fileName) {
  if (!fileName || basename(fileName) !== fileName) return
  await rm(join(uploadsDirectory, fileName), { force: true })
}

function getAdminToken(request) {
  requireAdmin(request)
  return true
}

async function handleUpload(request, response, productId) {
  requireAdmin(request)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productId)) fail(400, 'That product name is not valid yet.')
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  const extension = mimeExtensions.get(contentType)
  if (!extension) fail(415, 'Choose a JPG, PNG, or WebP photo.')
  const body = await readBody(request, uploadLimit)
  if (!body.length) fail(400, 'Choose a photo to upload.')
  const fileName = `${productId}-${randomUUID()}${extension}`
  await writeFileSafely(fileName, body)
  sendJson(response, 201, { imageUrl: `/uploads/${fileName}`, imagePath: fileName })
}

async function writeFileSafely(fileName, body) {
  const destination = join(uploadsDirectory, fileName)
  await new Promise((resolveWrite, rejectWrite) => {
    const stream = createWriteStream(destination, { flags: 'wx' })
    stream.on('error', rejectWrite)
    stream.on('finish', resolveWrite)
    stream.end(body)
  })
}

async function handleApi(request, response, url) {
  const pathname = url.pathname
  const method = request.method || 'GET'

  if (pathname === '/api/admin/status' && method === 'GET') {
    sendJson(response, 200, { isConfigured: isAdminConfigured() })
    return
  }
  if (pathname === '/api/admin/setup' && method === 'POST') {
    if (isAdminConfigured()) fail(409, 'An admin password is already set. Sign in instead.')
    const { username, password } = await readJson(request)
    if (typeof username !== 'string' || !username.trim()) fail(400, 'Choose an admin username.')
    if (typeof password !== 'string' || !password.length) fail(400, 'Choose an admin password.')
    storeAdminUsername(username.trim())
    storeAdminPassword(password)
    makeSession(response)
    return
  }
  if (pathname === '/api/admin/login' && method === 'POST') {
    const { username, password } = await readJson(request)
    if (!verifyAdminUsername(username) || typeof password !== 'string' || !verifyAdminPassword(password)) fail(401, 'Those admin credentials did not match. Please try again.')
    makeSession(response)
    return
  }
  if (pathname === '/api/admin/session' && method === 'GET') {
    getAdminToken(request)
    sendJson(response, 200, { signedIn: true })
    return
  }

  if (pathname === '/api/products' && method === 'GET') {
    const includeHidden = url.searchParams.get('includeHidden') === 'true'
    if (includeHidden) requireAdmin(request)
    sendJson(response, 200, await listProducts(!includeHidden))
    return
  }
  if (pathname === '/api/products' && method === 'PUT') {
    await saveProduct(request, response)
    return
  }

  const photoMatch = pathname.match(/^\/api\/products\/([^/]+)\/photo$/)
  if (photoMatch && method === 'POST') {
    await handleUpload(request, response, decodeURIComponent(photoMatch[1]))
    return
  }
  if (photoMatch && method === 'DELETE') {
    requireAdmin(request)
    const productId = decodeURIComponent(photoMatch[1])
    const existing = database.prepare('SELECT * FROM products WHERE id = ?').get(productId)
    if (!existing) fail(404, 'That fragrance could not be found.')
    await removeUploadedFile(existing.image_path)
    database.prepare('UPDATE products SET image_url = NULL, image_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(productId)
    sendJson(response, 200, { removed: true })
    return
  }

  const deleteImageMatch = pathname.match(/^\/api\/uploads\/([^/]+)$/)
  if (deleteImageMatch && method === 'DELETE') {
    requireAdmin(request)
    const fileName = decodeURIComponent(deleteImageMatch[1])
    await removeUploadedFile(fileName)
    sendJson(response, 200, { removed: true })
    return
  }

  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/)
  if (productMatch && method === 'DELETE') {
    requireAdmin(request)
    const id = decodeURIComponent(productMatch[1])
    const existing = database.prepare('SELECT image_path FROM products WHERE id = ?').get(id)
    if (!existing) fail(404, 'That fragrance could not be found.')
    database.prepare('DELETE FROM products WHERE id = ?').run(id)
    await removeUploadedFile(existing.image_path)
    sendJson(response, 200, { deleted: true })
    return
  }

  sendJson(response, 404, { error: 'That page could not be found.' })
}

async function serveUpload(response, pathname) {
  const fileName = decodeURIComponent(pathname.slice('/uploads/'.length))
  if (!fileName || basename(fileName) !== fileName) {
    sendJson(response, 404, { error: 'Photo not found.' })
    return
  }
  const filePath = join(uploadsDirectory, fileName)
  try {
    await stat(filePath)
    response.writeHead(200, {
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': mimeTypes.get(extname(fileName).toLowerCase()) || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    })
    createReadStream(filePath).pipe(response)
  } catch {
    sendJson(response, 404, { error: 'Photo not found.' })
  }
}

async function serveBuiltPage(response, pathname) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    sendJson(response, 400, { error: 'Invalid page path.' })
    return
  }
  const candidate = resolve(distDirectory, `.${decodedPath}`)
  if (candidate !== distDirectory && !candidate.startsWith(`${distDirectory}${sep}`)) {
    sendJson(response, 403, { error: 'That path is not available.' })
    return
  }
  let filePath = candidate
  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html')
    await stat(filePath)
  } catch {
    if (extname(decodedPath)) {
      sendJson(response, 404, { error: 'That file could not be found.' })
      return
    }
    filePath = join(distDirectory, 'index.html')
  }
  try {
    const content = await readFile(filePath)
    response.writeHead(200, {
      'content-type': mimeTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    })
    response.end(content)
  } catch {
    sendJson(response, 404, { error: 'Build the shop first, then restart it.' })
  }
}

const httpServer = createHttpServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost')
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url)
      return
    }
    if (url.pathname.startsWith('/uploads/')) {
      await serveUpload(response, url.pathname)
      return
    }
    if (vite) {
      vite.middlewares(request, response, (error) => {
        if (error && !response.headersSent) sendJson(response, 500, { error: 'The shop could not be opened.' })
      })
      return
    }
    await serveBuiltPage(response, url.pathname)
  } catch (error) {
    if (response.headersSent) {
      response.destroy()
      return
    }
    const statusCode = Number(error?.statusCode) || 500
    sendJson(response, statusCode, { error: statusCode === 500 ? 'Something went wrong. Please try again.' : error.message })
    if (statusCode === 500) console.error(error)
  }
})

if (!isProduction) {
  const { createServer: createViteServer } = await import('vite')
  vite = await createViteServer({
    configFile: join(projectRoot, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: 'spa',
  })
}

const host = process.env.HOST || (isProduction ? '0.0.0.0' : '127.0.0.1')
httpServer.listen(port, host, () => {
  console.log(`KORA ${isProduction ? 'shop' : 'development server'} is ready at http://localhost:${port}`)
  console.log(`Local product database: ${databaseFile}`)
})

async function shutDown() {
  if (vite) await vite.close()
  database.close()
  httpServer.close(() => process.exit(0))
}

process.once('SIGINT', shutDown)
process.once('SIGTERM', shutDown)
