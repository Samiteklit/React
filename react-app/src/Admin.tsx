import { useCallback, useEffect, useState, type FormEvent } from 'react'
import './Admin.css'
import { starterFragrances } from './data/fragrances'
import { formatPrice } from './lib/currency'
import { getProducts, removeProduct, removeUploadedImage, saveProduct, uploadProductImage } from './lib/products'
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabase'
import type { Family, Fragrance, ProductDraft } from './types'

const tokenKey = 'kora-local-admin-token'

const blankProduct: ProductDraft = {
  id: '', name: '', family: 'Floral', notes: '', price: 0, size: '50 ml', tag: '',
  glass: '#e8cfd2', liquid: '#b97880', cap: '#6B1F3A', backdrop: '#EDE3D7', shape: 'square',
  imageUrl: null, imagePath: null, isActive: true, soldOut: false,
}

const scentFamilies: Family[] = ['Floral', 'Woody', 'Fresh', 'Amber']
const bottleSizes = ['5 ml', '10 ml', '30 ml', '50 ml', '100 ml'] as const

function slugify(value: string) {
  return value.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  const result = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.')
  return result as T
}

function Admin() {
  const supabaseMode = isSupabaseConfigured
  const [token, setToken] = useState('')
  const [authReady, setAuthReady] = useState(false)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [products, setProducts] = useState<Fragrance[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [form, setForm] = useState<ProductDraft>(blankProduct)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const signOut = useCallback(async () => {
    try {
      if (supabaseMode) {
        const { error: signOutError } = await getSupabaseClient().auth.signOut()
        if (signOutError) throw new Error(signOutError.message)
      } else {
        localStorage.removeItem(tokenKey)
        setToken('')
        setIsAdmin(false)
        setProducts([])
      }
      setMessage('You are signed out.')
    } catch (signOutError) {
      setError(errorText(signOutError))
    }
  }, [supabaseMode])

  useEffect(() => {
    let alive = true
    if (supabaseMode) {
      const supabase = getSupabaseClient()
      const verifySession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => {
        if (!session) return
        const { data, error: adminError } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', session.user.id)
          .maybeSingle()
        if (!alive) return
        if (adminError) throw new Error(adminError.message)
        if (!data) {
          await supabase.auth.signOut()
          throw new Error('This account is not authorized for the KORA studio.')
        }
        setEmail(session.user.email ?? '')
        setToken(session.access_token)
        setIsAdmin(true)
      }
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' && alive) {
          setToken('')
          setIsAdmin(false)
          setEmail('')
          setProducts([])
        }
        if (event === 'TOKEN_REFRESHED' && session && alive) setToken(session.access_token)
      })
      supabase.auth.getSession()
        .then(async ({ data, error: sessionError }) => {
          if (sessionError) throw new Error(sessionError.message)
          await verifySession(data.session)
        })
        .catch((sessionError: unknown) => { if (alive) setError(errorText(sessionError)) })
        .finally(() => { if (alive) setAuthReady(true) })
      return () => {
        alive = false
        subscription.unsubscribe()
      }
    }
    const savedToken = localStorage.getItem(tokenKey) || ''
    apiJson<{ isConfigured: boolean }>('/api/admin/status')
      .then(async ({ isConfigured }) => {
        if (!alive) return
        setSetupNeeded(!isConfigured)
        if (savedToken) {
          try {
            await apiJson('/api/admin/session', { headers: { 'x-kora-admin-token': savedToken } })
            if (alive) {
              setToken(savedToken)
              setIsAdmin(true)
            }
          } catch {
            localStorage.removeItem(tokenKey)
          }
        }
      })
      .catch((statusError: unknown) => {
        if (alive) setError(errorText(statusError))
      })
      .finally(() => { if (alive) setAuthReady(true) })
    return () => { alive = false }
  }, [supabaseMode])

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null)
      return
    }
    const previewUrl = URL.createObjectURL(photo)
    setPhotoPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [photo])

  useEffect(() => {
    if (!isAdmin || (!supabaseMode && !token)) return
    let alive = true
    setLoadingProducts(true)
    getProducts(false, token).then((items) => {
      if (alive) setProducts(items)
    }).catch((loadError: unknown) => {
      if (alive) {
        setError(errorText(loadError))
        if (loadError instanceof Error && loadError.message.includes('sign in')) {
          setError('')
          signOut()
        }
      }
    }).finally(() => {
      if (alive) setLoadingProducts(false)
    })
    return () => { alive = false }
  }, [isAdmin, signOut, supabaseMode, token])

  function resetForm() {
    setForm(blankProduct)
    setPhoto(null)
    setRemovePhoto(false)
    setError('')
  }

  function editProduct(product: Fragrance) {
    setForm({ ...product, isActive: product.isActive ?? true, soldOut: product.soldOut ?? false })
    setPhoto(null)
    setRemovePhoto(false)
    setError('')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function updateForm<Key extends keyof ProductDraft>(key: Key, value: ProductDraft[Key]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function refreshProducts() {
    setProducts(await getProducts(false, token))
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (supabaseMode) {
      try {
        const supabase = getSupabaseClient()
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw new Error(signInError.message)
        if (!data.session) throw new Error('Supabase did not return a signed-in session.')
        const { data: admin, error: adminError } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', data.session.user.id)
          .maybeSingle()
        if (adminError) throw new Error(adminError.message)
        if (!admin) {
          await supabase.auth.signOut()
          throw new Error('This account is not authorized for the KORA studio.')
        }
        setToken(data.session.access_token)
        setIsAdmin(true)
        setEmail(data.session.user.email ?? email)
        setPassword('')
      } catch (authError) {
        setError(errorText(authError))
      }
      return
    }
    if (setupNeeded && password !== confirmPassword) {
      setError('Those passwords do not match yet.')
      return
    }
    try {
      const endpoint = setupNeeded ? '/api/admin/setup' : '/api/admin/login'
      const result = await apiJson<{ token: string }>(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      localStorage.setItem(tokenKey, result.token)
      setToken(result.token)
      setIsAdmin(true)
      setSetupNeeded(false)
      setPassword('')
      setConfirmPassword('')
    } catch (authError) {
      setError(errorText(authError))
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const productId = form.id || slugify(form.name)
    if (!productId) {
      setError('Add a product name first.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    let uploaded: { imageUrl: string; imagePath: string } | null = null
    const previousImagePath = form.imagePath
    try {
      if (photo) uploaded = await uploadProductImage(photo, productId, token)
      const imageUrl = uploaded?.imageUrl ?? (removePhoto ? null : form.imageUrl ?? null)
      const imagePath = uploaded?.imagePath ?? (removePhoto ? null : form.imagePath ?? null)
      const saved = await saveProduct({ ...form, id: productId, imageUrl, imagePath }, token)
      setProducts((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)))
      setMessage(`${saved.name} saved to the KORA collection.`)
      resetForm()
      if (supabaseMode && previousImagePath && previousImagePath !== imagePath) {
        try {
          await removeUploadedImage(previousImagePath, token)
        } catch (cleanupError) {
          setError(`${saved.name} was saved, but its previous photo could not be removed: ${errorText(cleanupError)}`)
        }
      }
    } catch (saveError) {
      let cleanupMessage = ''
      if (uploaded) {
        try {
          await removeUploadedImage(uploaded.imagePath, token)
        } catch (cleanupError) {
          cleanupMessage = ` The newly uploaded photo could not be cleaned up: ${errorText(cleanupError)}`
        }
      }
      setError(`${errorText(saveError)}${cleanupMessage}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(product: Fragrance) {
    if (!window.confirm(`Delete ${product.name} from the collection?`)) return
    setWorkingId(product.id)
    setError('')
    setMessage('')
    try {
      await removeProduct(product.id, token)
      setProducts((current) => current.filter((item) => item.id !== product.id))
      if (form.id === product.id) resetForm()
      setMessage(`${product.name} deleted.`)
    } catch (deleteError) {
      setError(errorText(deleteError))
    } finally {
      setWorkingId('')
    }
  }

  if (!authReady) {
    return <div className="admin-page"><div className="admin-loading">Opening the KORA studio…</div></div>
  }

  if (error && !isAdmin && !setupNeeded && !supabaseMode) {
    return (
      <div className="admin-page">
        <header className="admin-topbar"><a className="admin-brand" href="/">KORA <span>FRAGRANCE HOUSE</span></a><a className="admin-back" href="/">Back to shop ↗</a></header>
        <main className="admin-login-card"><span className="admin-kicker">LOCAL KORA STUDIO</span><h1>Couldn’t open the studio.</h1><p>Start the KORA shop on this computer, then refresh this page.</p><p className="admin-error" role="alert">{error}</p></main>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <header className="admin-topbar"><a className="admin-brand" href="/">KORA <span>FRAGRANCE HOUSE</span></a><a className="admin-back" href="/">Back to shop ↗</a></header>
        <main className="admin-login-card">
          <span className="admin-kicker">THE KORA HOUSE · ADMIN</span>
          <h1>{!supabaseMode && setupNeeded ? 'Set up your studio.' : 'Welcome back.'}</h1>
          <p>{supabaseMode ? 'Sign in with your authorized KORA administrator account.' : setupNeeded ? 'Choose a password to protect the product studio on this computer.' : 'Enter your KORA studio password to manage products and photos.'}</p>
          <form className="admin-form" onSubmit={submitPassword}>
            {supabaseMode && <label>Email<input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}
            {!supabaseMode && <label>Admin username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>}
            <label>{!supabaseMode && setupNeeded ? 'Create a password' : 'Studio password'}<input autoComplete={!supabaseMode && setupNeeded ? 'new-password' : 'current-password'} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            {!supabaseMode && setupNeeded && <label>Type the password again<input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>}
            {error && <p className="admin-error" role="alert">{error}</p>}
            <button className="admin-submit" type="submit">{!supabaseMode && setupNeeded ? 'Create local password' : 'Sign in'} <span>↗</span></button>
          </form>
          <p className="admin-login-help">{supabaseMode ? 'Admin accounts must be created in Supabase and explicitly authorized for the KORA studio.' : 'Products and photos are saved only on this computer.'}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <header className="admin-topbar"><a className="admin-brand" href="/">KORA <span>FRAGRANCE HOUSE</span></a><div className="admin-top-actions"><span className="admin-signed-in">{supabaseMode ? `Signed in${email ? ` as ${email}` : ''}` : 'Saved on this computer'}</span><a className="admin-back" href="/">View shop ↗</a><button className="admin-back admin-text-button" onClick={() => { void signOut() }}>Sign out</button></div></header>
      <main className="admin-main">
        <div className="admin-heading"><div><span className="admin-kicker">THE KORA HOUSE · STUDIO</span><h1>Product collection</h1><p>Manage the fragrances and photography shown in your shop.</p></div><span className="admin-total">{products.length} {products.length === 1 ? 'SCENT' : 'SCENTS'}</span></div>
        {message && <div className="admin-success" role="status">{message}</div>}
        {error && <div className="admin-error admin-banner" role="alert">{error}</div>}
        <div className="admin-layout">
          <section className="admin-editor-panel">
            <div className="admin-panel-heading"><div><span className="admin-kicker">{form.id ? 'EDIT FRAGRANCE' : 'NEW FRAGRANCE'}</span><h2>{form.id ? form.name : 'Add a scent'}</h2></div>{form.id && <button type="button" className="admin-quiet-button" onClick={resetForm}>New product</button>}</div>
            <form className="admin-form" onSubmit={handleSave}>
              <label>Product name<input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="e.g. Rose at Dusk" required /></label>
              <div className="admin-form-row"><label>Scent family<select value={form.family} onChange={(event) => updateForm('family', event.target.value as Family)}>{scentFamilies.map((family) => <option key={family}>{family}</option>)}</select></label><label>Price (ETB)<input type="number" min="0" step="0.01" value={form.price} onChange={(event) => updateForm('price', Number(event.target.value))} required /></label></div>
              <div className="admin-form-row"><label>Bottle size<select value={form.size} onChange={(event) => updateForm('size', event.target.value)} required>{bottleSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label><label>Small label<input value={form.tag ?? ''} onChange={(event) => updateForm('tag', event.target.value)} placeholder="Bestseller (optional)" /></label></div>
              <label>Fragrance notes<input value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Rose · pink pepper · musk" required /></label>
              <div className="admin-photo-label"><span>Product photo</span><small>JPG, PNG or WebP · up to 5 MB</small></div>
              <label className="admin-upload-zone">
                {(photoPreview || (!removePhoto && form.imageUrl)) ? <img src={photoPreview ?? form.imageUrl ?? ''} alt="Product preview" /> : <span className="admin-upload-mark">＋</span>}
                <span>{photo ? photo.name : (form.imageUrl && !removePhoto ? 'Choose a different photo' : 'Choose a product photo')}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setPhoto(event.target.files?.[0] ?? null); setRemovePhoto(false) }} />
              </label>
              {(form.imageUrl || photo) && <button type="button" className="admin-remove-photo" onClick={() => { setPhoto(null); setRemovePhoto(true) }}>Remove photo</button>}
              <label className="admin-active-toggle"><input type="checkbox" checked={form.isActive ?? true} onChange={(event) => updateForm('isActive', event.target.checked)} /><span><strong>Visible in the shop</strong><small>Turn this off to hide it without deleting it.</small></span></label>
              <label className="admin-active-toggle"><input type="checkbox" checked={form.soldOut ?? false} onChange={(event) => updateForm('soldOut', event.target.checked)} /><span><strong>Sold out</strong><small>Keep it visible, but stop customers adding it to their bag.</small></span></label>
              <button className="admin-submit" type="submit" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save fragrance' : 'Add fragrance'} <span>↗</span></button>
            </form>
          </section>
          <section className="admin-products-panel">
            <div className="admin-panel-heading"><div><span className="admin-kicker">YOUR CATALOG</span><h2>All fragrances</h2></div><button className="admin-refresh" type="button" onClick={() => refreshProducts().catch((loadError: unknown) => setError(errorText(loadError)))} aria-label="Refresh fragrances">↻</button></div>
            {loadingProducts ? <div className="admin-empty-state">Loading your fragrances…</div> : products.length ? (
              <div className="admin-product-list">
                {products.map((product) => (
                  <article className="admin-product-row" key={product.id}>
                    <div className="admin-product-thumb" style={{ backgroundColor: product.backdrop }}>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <img src="/kora-logo.png" alt="" />}</div>
                    <div className="admin-product-details"><strong>{product.name}</strong><span>{product.family} · {product.size} · {formatPrice(product.price)}</span><small>{product.isActive === false ? 'Hidden from shop' : product.soldOut ? 'Sold out · visible in shop' : 'Visible in shop'}</small></div>
                    <button type="button" className="admin-row-edit" onClick={() => editProduct(product)}>Edit</button>
                    <button type="button" className="admin-row-delete" onClick={() => handleDelete(product)} disabled={workingId === product.id} aria-label={`Delete ${product.name}`}>{workingId === product.id ? '…' : '×'}</button>
                  </article>
                ))}
              </div>
            ) : <div className="admin-empty-state"><span>✳</span><strong>Your collection starts here.</strong><p>Add a fragrance and its details will appear on the storefront.</p></div>}
            {products.length === 0 && <button className="admin-seed-button" type="button" onClick={() => { const first = starterFragrances[0]; if (first) editProduct(first) }}>Use a starter fragrance as a draft</button>}
          </section>
        </div>
        <p className="admin-footer-note">Your product list and photos are saved in the KORA folder on this computer.</p>
      </main>
    </div>
  )
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

export default Admin
