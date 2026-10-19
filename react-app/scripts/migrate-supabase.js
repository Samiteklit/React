import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createClient } from '@supabase/supabase-js'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const envFile = join(projectRoot, '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const email = process.env.KORA_MIGRATION_EMAIL
const password = process.env.KORA_MIGRATION_PASSWORD
if (!supabaseUrl || !publishableKey || !email || !password) {
  throw new Error('Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, KORA_MIGRATION_EMAIL, and KORA_MIGRATION_PASSWORD in .env.local.')
}

const dataDirectory = process.env.KORA_DATA_DIR || join(projectRoot, 'data')
const database = new DatabaseSync(join(dataDirectory, 'kora.sqlite'), { readOnly: true })
const supabase = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function migrate() {
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError) throw new Error(`Supabase sign-in failed: ${authError.message}`)
  if (!auth.user) throw new Error('Supabase did not return a signed-in user.')

  const { data: admin, error: adminError } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (adminError) throw new Error(`Could not verify migration access: ${adminError.message}`)
  if (!admin) throw new Error('This Supabase user is not authorized as a KORA admin.')

  const products = database.prepare('SELECT * FROM products ORDER BY id').all()
  const rows = []
  let photoCount = 0

  for (const product of products) {
    let imageUrl = product.image_url
    let imagePath = product.image_path
    if (imageUrl?.startsWith('/uploads/')) {
      const fileName = imagePath || basename(imageUrl.slice('/uploads/'.length))
      if (!fileName || basename(fileName) !== fileName) {
        throw new Error(`Unexpected local image path for product ${product.id}.`)
      }
      const body = readFileSync(join(dataDirectory, 'uploads', fileName))
      const contentType = fileName.endsWith('.png') ? 'image/png' : fileName.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
      const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, body, {
        contentType,
        upsert: true,
      })
      if (uploadError) throw new Error(`Could not upload photo for ${product.name}: ${uploadError.message}`)
      imagePath = fileName
      imageUrl = supabase.storage.from('product-images').getPublicUrl(fileName).data.publicUrl
      photoCount += 1
    }
    rows.push({
      id: product.id,
      name: product.name,
      family: product.family,
      notes: product.notes,
      price: product.price,
      size: product.size,
      tag: product.tag,
      glass: product.glass,
      liquid: product.liquid,
      cap: product.cap,
      backdrop: product.backdrop,
      shape: product.shape,
      image_url: imageUrl,
      image_path: imagePath,
      is_active: Boolean(product.is_active),
      sold_out: Boolean(product.sold_out),
      created_at: product.created_at,
      updated_at: product.updated_at,
    })
  }

  if (rows.length) {
    const { error } = await supabase.from('products').upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`Could not migrate the product catalog: ${error.message}`)
  }
  console.log(`Migrated ${rows.length} products and ${photoCount} photos to Supabase.`)
  console.log('The local admin-password hash and SQLite database were not changed.')
}

try {
  await migrate()
} finally {
  database.close()
}
