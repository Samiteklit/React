import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import './Admin.css'
import { starterFragrances } from './data/fragrances'
import { formatPrice } from './lib/currency'
import { getProducts, removeProduct, removeUploadedImage, saveProduct, uploadProductImage } from './lib/products'
import { getUser, login, logout, handleAuthCallback, acceptInvite, updateUser, requestPasswordRecovery, onAuthChange } from '@netlify/identity'
import type { Family, Fragrance, ProductDraft } from './types'

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
  const authCallback = useRef<ReturnType<typeof handleAuthCallback> | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [inviteToken, setInviteToken] = useState('')
  const [resetting, setResetting] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState('')
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
      await logout()
      setIsAdmin(false)
      setProducts([])
      setMessage('You are signed out.')
    } catch (error) { setError(errorText(error)) }
  }, [])

  useEffect(() => {
    let alive = true
    const unsubscribe = onAuthChange((event) => {
      if (event === 'logout' && alive) { setIsAdmin(false); setProducts([]) }
    })
    async function restore() {
      try {
        const callback = await (authCallback.current ??= handleAuthCallback())
        if (!alive) return
        if (callback?.type === 'invite' && callback.token) { setInviteToken(callback.token); return }
        if (callback?.type === 'recovery') { setResetting(true); return }
        const user = await getUser()
        if (!user || !alive) return
        await apiJson('/api/admin/session')
        if (alive) { setEmail(user.email ?? ''); setIsAdmin(true) }
      } catch (error) { if (alive) setError(errorText(error)) }
      finally { if (alive) setAuthReady(true) }
    }
    void restore()
    return () => { alive = false; unsubscribe() }
  }, [])

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
    if (!isAdmin) return
    let alive = true
    setLoadingProducts(true)
    getProducts(false).then((items) => {
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
  }, [isAdmin, signOut])

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
    setProducts(await getProducts(false))
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    if ((inviteToken || resetting) && password !== confirmPassword) {
      setError('Those passwords do not match yet.')
      return
    }
    setAuthBusy(true)
    try {
      if (inviteToken) await acceptInvite(inviteToken, password)
      else if (resetting) await updateUser({ password })
      else await login(email, password)
      setInviteToken('')
      setResetting(false)
      setPassword('')
      setConfirmPassword('')
      await apiJson('/api/admin/session')
      const user = await getUser()
      setEmail(user?.email ?? email)
      setIsAdmin(true)
    } catch (error) { setError(errorText(error)) }
    finally { setAuthBusy(false) }
  }

  async function recoverPassword() {
    setError('')
    if (!email) { setError('Enter your email address first.'); return }
    try {
      await requestPasswordRecovery(email)
      setMessage('Check your email for a password reset link.')
    } catch (error) { setError(errorText(error)) }
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
      if (photo) uploaded = await uploadProductImage(photo, productId)
      const imageUrl = uploaded?.imageUrl ?? (removePhoto ? null : form.imageUrl ?? null)
      const imagePath = uploaded?.imagePath ?? (removePhoto ? null : form.imagePath ?? null)
      const saved = await saveProduct({ ...form, id: productId, imageUrl, imagePath })
      setProducts((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)))
      setMessage(`${saved.name} saved to the KORA collection.`)
      resetForm()
      if (previousImagePath && previousImagePath !== imagePath) {
        try {
          await removeUploadedImage(previousImagePath)
        } catch (cleanupError) {
          setError(`${saved.name} was saved, but its previous photo could not be removed: ${errorText(cleanupError)}`)
        }
      }
    } catch (saveError) {
      let cleanupMessage = ''
      if (uploaded) {
        try {
          await removeUploadedImage(uploaded.imagePath)
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
      await removeProduct(product.id)
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

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <header className="admin-topbar"><a className="admin-brand" href="/">KORA <span>FRAGRANCE HOUSE</span></a><a className="admin-back" href="/">Back to shop ↗</a></header>
        <main className="admin-login-card">
          <span className="admin-kicker">THE KORA HOUSE · ADMIN</span>
          <h1>{inviteToken ? 'Set up your studio.' : resetting ? 'Choose a new password.' : 'Welcome back.'}</h1>
          <p>Sign in with your authorized KORA administrator account.</p>
          <form className="admin-form" onSubmit={submitPassword}>
            {!inviteToken && !resetting && <label>Email<input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}
            <label>{inviteToken || resetting ? 'New password' : 'Studio password'}<input autoComplete={inviteToken || resetting ? 'new-password' : 'current-password'} type="password" minLength={inviteToken || resetting ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            {(inviteToken || resetting) && <label>Confirm password<input autoComplete="new-password" type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>}
            {error && <p className="admin-error" role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
            <button className="admin-submit" type="submit" disabled={authBusy}>{authBusy ? 'Signing in…' : inviteToken || resetting ? 'Save password' : 'Sign in'} <span>↗</span></button>
            {!inviteToken && !resetting && <button className="admin-back admin-text-button" type="button" onClick={() => { void recoverPassword() }}>Forgot password?</button>}
          </form>
          <p className="admin-login-help">Administrator accounts need an invitation and the admin role in Netlify Identity.</p>
        </main>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <header className="admin-topbar"><a className="admin-brand" href="/">KORA <span>FRAGRANCE HOUSE</span></a><div className="admin-top-actions"><span className="admin-signed-in">{`Signed in${email ? ` as ${email}` : ''}`}</span><a className="admin-back" href="/">View shop ↗</a><button className="admin-back admin-text-button" onClick={() => { void signOut() }}>Sign out</button></div></header>
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
        <p className="admin-footer-note">Your collection and photos are saved securely online.</p>
      </main>
    </div>
  )
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

export default Admin
