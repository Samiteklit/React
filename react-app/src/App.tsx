import { useEffect, useId, useMemo, useState } from 'react'
import './App.css'
import Admin from './Admin'
import { formatPrice } from './lib/currency'
import { getProducts } from './lib/products'

import type { Fragrance } from './types'
import { starterFragrances as fragrances } from './data/fragrances'

const families = ['All scents', 'Floral', 'Woody', 'Fresh', 'Amber'] as const

function FragranceArt({ product, hero = false }: { product: Fragrance; hero?: boolean }) {
  const rawId = useId().replaceAll(':', '')

  if (product.imageUrl) {
    return <img className={hero ? 'fragrance-art fragrance-art--hero' : 'fragrance-art'} src={product.imageUrl} alt={`${product.name} perfume`} />
  }

  const glassId = `glass-${rawId}`
  const shineId = `shine-${rawId}`
  const clipId = `clip-${rawId}`

  const bodyPath =
    product.shape === 'round'
      ? 'M180 137 C224 137 251 161 251 198 L251 291 C251 320 224 337 180 337 C136 337 109 320 109 291 L109 198 C109 161 136 137 180 137 Z'
      : product.shape === 'slim'
        ? 'M136 137 Q136 130 146 130 L214 130 Q224 130 224 137 L235 307 Q236 330 216 333 L144 333 Q124 330 125 307 Z'
        : 'M119 145 Q119 135 131 135 L229 135 Q241 135 241 145 L241 310 Q241 330 221 330 L139 330 Q119 330 119 310 Z'

  return (
    <svg
      className={hero ? 'fragrance-art fragrance-art--hero' : 'fragrance-art'}
      viewBox="0 0 360 420"
      role="img"
      aria-label={`${product.name} perfume bottle illustration`}
    >
      <title>{product.name}</title>
      <defs>
        <linearGradient id={glassId} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fffaf2" stopOpacity=".94" />
          <stop offset=".42" stopColor={product.glass} stopOpacity=".82" />
          <stop offset="1" stopColor="#fffaf2" stopOpacity=".65" />
        </linearGradient>
        <linearGradient id={shineId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity=".62" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={bodyPath} />
        </clipPath>
      </defs>
      <ellipse cx="180" cy="354" rx="88" ry="13" fill="#513a31" opacity=".13" />
      {hero && (
        <g className="art-botanical" fill="none" stroke="#8e7967" strokeLinecap="round">
          <path d="M53 324 C89 272 81 205 62 143" strokeWidth="1.2" />
          <path d="M73 281 C42 267 36 244 38 225 C58 232 73 249 73 281Z" strokeWidth="1" />
          <path d="M80 238 C104 222 108 201 104 183 C85 191 75 211 80 238Z" strokeWidth="1" />
          <path d="M288 309 C272 254 283 194 311 149" strokeWidth="1.2" />
          <path d="M282 260 C305 245 314 224 311 204 C292 214 282 233 282 260Z" strokeWidth="1" />
          <path d="M291 219 C267 202 263 181 270 164 C288 174 297 194 291 219Z" strokeWidth="1" />
        </g>
      )}
      <path d={bodyPath} fill={`url(#${glassId})`} stroke="#fffaf3" strokeWidth="2" />
      <g clipPath={`url(#${clipId})`}>
        <path d="M112 244 Q180 237 248 244 L248 345 L112 345Z" fill={product.liquid} opacity=".66" />
        <path d="M119 244 Q180 251 241 244" fill="none" stroke="#fff5df" strokeWidth="2" opacity=".74" />
        <path d="M131 154 L143 154 L143 308 L131 308Z" fill={`url(#${shineId})`} opacity=".55" />
      </g>
      <path d={bodyPath} fill="none" stroke="#fffdf8" strokeWidth="2" opacity=".72" />
      <rect x="159" y="106" width="42" height="34" rx="5" fill={product.glass} stroke="#fffaf3" strokeWidth="1.5" />
      <rect x="145" y="60" width="70" height="48" rx="7" fill={product.cap} />
      <path d="M152 67 Q180 58 208 67" fill="none" stroke="#fff" strokeWidth="1" opacity=".42" />
      <rect x="133" y="201" width="94" height="78" rx="2" fill="#FBF8F4" opacity=".96" />
      <image href="/kora-logo.png" x="146" y="202" width="68" height="68" preserveAspectRatio="xMidYMid meet" />
      <text x="180" y="291" textAnchor="middle" fontSize="8" fill="#3D1125" fontFamily="Georgia, serif">
        {product.name}
      </text>
      <text x="180" y="303" textAnchor="middle" fontSize="5.5" letterSpacing="1" fill="#8B7968" fontFamily="Arial, sans-serif">
        EAU DE PARFUM
      </text>
    </svg>
  )
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-stroke">
      <path d="M5 8h14l1 13H4L5 8Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </svg>
  )
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? 'heart-icon is-filled' : 'heart-icon'}>
      <path d="M20.8 8.8c0 5.3-8.8 10.2-8.8 10.2S3.2 14.1 3.2 8.8A4.6 4.6 0 0 1 12 6.5a4.6 4.6 0 0 1 8.8 2.3Z" />
    </svg>
  )
}

function Storefront() {
  const [family, setFamily] = useState<(typeof families)[number]>('All scents')
  const [search, setSearch] = useState('')
  const [catalog, setCatalog] = useState<Fragrance[]>(fragrances)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [favorites, setFavorites] = useState<string[]>([])
  const [bagOpen, setBagOpen] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    getProducts().then((products) => {
      if (alive) setCatalog(products)
    }).catch(() => {
      if (alive) setNotice('The online collection could not load. Showing the starter scents for now.')
    })
    return () => { alive = false }
  }, [])

  const visibleFragrances = useMemo(() => {
    const query = search.trim().toLowerCase()
    return catalog.filter((product) => {
      const matchesFamily = family === 'All scents' || product.family === family
      const matchesSearch =
        !query || `${product.name} ${product.family} ${product.notes}`.toLowerCase().includes(query)
      return matchesFamily && matchesSearch
    })
  }, [catalog, family, search])

  const cartCount = Object.values(cart).reduce((total, quantity) => total + quantity, 0)
  const cartProducts = catalog.filter((product) => cart[product.id])
  const subtotal = cartProducts.reduce((total, product) => total + product.price * cart[product.id], 0)
  const telegramOrderMessage = [
    'Hello KORA, I would like to place this order:',
    '',
    ...cartProducts.map((product) =>
      `• ${product.name} (${product.size}) × ${cart[product.id]} — ${formatPrice(product.price * cart[product.id])}`,
    ),
    '',
    `Subtotal: ${formatPrice(subtotal)}`,
    '',
    'Please confirm delivery details and payment options.',
  ].join('\n')
  const telegramCheckoutUrl = `https://t.me/+251988112882?text=${encodeURIComponent(telegramOrderMessage)}`
  const heroProduct = catalog[0] ?? fragrances[0]

  function addToBag(product: Fragrance) {
    if (product.soldOut) return
    setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }))
    setNotice(`${product.name} added to your bag`)
    window.setTimeout(() => setNotice(''), 2600)
  }

  function changeQuantity(productId: string, amount: number) {
    setCart((current) => {
      const nextQuantity = (current[productId] ?? 0) + amount
      if (nextQuantity <= 0) {
        const next = { ...current }
        delete next[productId]
        return next
      }
      return { ...current, [productId]: nextQuantity }
    })
  }

  function toggleFavorite(productId: string) {
    setFavorites((current) =>
      current.includes(productId)
        ? current.filter((favorite) => favorite !== productId)
        : [...current, productId],
    )
  }

  return (
    <div className="storefront">
      <div className="announcement-bar">
        <span>Find your own rhythm in fragrance</span>
        <span className="announcement-separator">✳</span>
        <span>{catalog.length} scents to explore</span>
      </div>

      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Kora home">
          <img className="brand-logo brand-logo--header" src="/kora-logo.png" alt="KORA" />
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#collection">Shop all</a>
          <a href="#collection">Discover by scent</a>
          <a href="#about">Our house</a>
        </nav>
        <button className="bag-button" type="button" onClick={() => setBagOpen(true)} aria-label={`Open shopping bag, ${cartCount} items`}>
          <BagIcon />
          <span>Bag</span>
          <span className="bag-count">{cartCount}</span>
        </button>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> Kora fragrance house · Scent, with soul</p>
            <h1>Wear a feeling.<br /><em>Leave a trace.</em></h1>
            <p className="hero-description">
              Fragrances with a sense of place, made to follow your own rhythm.
            </p>
            <div className="hero-actions">
              <a className="button button-dark" href="#collection">Explore the scents <span aria-hidden="true">↗</span></a>
              <a className="text-link" href="#about">A little about Kora</a>
            </div>
            <div className="hero-proof">
              <div className="proof-stars" aria-hidden="true">✳</div>
              <span>{catalog.length} fragrances · one to make your own</span>
            </div>
          </div>
          <div className="hero-visual" aria-label={`Featured fragrance, ${heroProduct.name}`}>
            <div className="hero-visual-top"><span>THE SCENT EDIT</span><span>01 — {String(catalog.length).padStart(2, '0')}</span></div>
            <div className="hero-art-wrap"><FragranceArt product={heroProduct} hero /></div>
            <div className="hero-product-caption">
              <span className="caption-number">01</span>
              <span><strong>{heroProduct.name}</strong><small>{heroProduct.notes}</small></span>
              <span className="caption-price">{formatPrice(heroProduct.price)}</span>
            </div>
            <div className="hero-stamp" aria-hidden="true"><span>SCENT<br />IS A<br />MEMORY</span><b>✳</b></div>
          </div>
        </section>

        <section className="values-strip" aria-label="Our promises">
          <div><span className="value-icon">✳</span> Made for personal rituals</div>
          <div><span className="value-icon">◌</span> Find your own rhythm</div>
          <div><span className="value-icon">✦</span> A scent to call your own</div>
        </section>

        <section className="collection-section" id="collection">
          <div className="section-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> Find your note</p>
              <h2>A scent for <em>every self.</em></h2>
            </div>
            <p className="section-intro">{catalog.length} considered fragrances. Each one a different way to feel like you.</p>
          </div>

          <div className="collection-toolbar">
            <div className="filter-list" role="group" aria-label="Filter fragrances by scent family">
              {families.map((item) => (
                <button
                  className={family === item ? 'filter-chip is-active' : 'filter-chip'}
                  type="button"
                  aria-pressed={family === item}
                  key={item}
                  onClick={() => setFamily(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="search-field">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search scents"
                aria-label="Search fragrances"
              />
            </label>
          </div>

          {visibleFragrances.length ? (
            <div className="product-grid">
              {visibleFragrances.map((product, index) => {
                const favorite = favorites.includes(product.id)
                return (
                  <article className="product-card" key={product.id}>
                    <div className="product-art" style={{ backgroundColor: product.backdrop }}>
                      <span className="product-index">0{index + 1}</span>
                      {product.tag && <span className="product-tag">{product.tag}</span>}
                      {product.soldOut && <span className="product-sold-out">Sold out</span>}
                      <button
                        className="favorite-button"
                        type="button"
                        onClick={() => toggleFavorite(product.id)}
                        aria-label={favorite ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
                        aria-pressed={favorite}
                      >
                        <HeartIcon filled={favorite} />
                      </button>
                      <FragranceArt product={product} />
                    </div>
                    <div className="product-info">
                      <div className="product-meta"><span>{product.family} fragrance</span><span>{product.size}</span></div>
                      <div className="product-title-row"><h3>{product.name}</h3><span className="product-price">{formatPrice(product.price)}</span></div>
                      <p className="product-notes">{product.notes}</p>
                      <button className={product.soldOut ? 'add-button is-sold-out' : 'add-button'} type="button" onClick={() => addToBag(product)} disabled={product.soldOut}>
                        {product.soldOut ? 'Sold out' : 'Add to bag'} <span aria-hidden="true">{product.soldOut ? '×' : '+'}</span>
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="empty-results">
              <p>No fragrances found for “{search}”.</p>
              <button type="button" className="text-link" onClick={() => { setSearch(''); setFamily('All scents') }}>Clear filters</button>
            </div>
          )}
          <p className="collection-footnote">Not sure where to begin? Explore the full collection <a href="#discovery">Find your scent ↗</a></p>
        </section>

        <section className="story-section" id="about">
          <div className="story-ornament" aria-hidden="true">A<span>✳</span></div>
          <div className="story-content">
            <p className="eyebrow eyebrow-light"><span className="eyebrow-line" /> A note from Kora</p>
            <h2>Find your rhythm.<br /><em>Leave a little magic.</em></h2>
            <p>Kora is a small fragrance house for the rituals, places, and people that stay with you. Find a scent that feels like your own.</p>
            <a href="#collection" className="story-link">Meet the collection <span aria-hidden="true">↗</span></a>
          </div>
          <div className="story-aside"><span>01 / OUR PHILOSOPHY</span><p>“A fragrance is a small ritual. Make it yours, and let it take you somewhere.”</p><span className="signature">The Kora house</span></div>
        </section>

        <section className="discovery-section" id="discovery">
          <span className="discovery-mark" aria-hidden="true">✳</span>
          <div><p className="eyebrow">A little first impression</p><h2>Not sure where to start?</h2><p>Explore all six scents, then find the one that feels like yours.</p></div>
          <a href="#collection" className="button button-outline">Explore all scents <span aria-hidden="true">↗</span></a>
        </section>
      </main>

      <footer className="site-footer">
        <a className="wordmark wordmark-footer" href="#top" aria-label="Kora home"><img className="brand-logo brand-logo--footer" src="/kora-logo.png" alt="KORA" /></a>
        <span>Find your rhythm in fragrance.</span>
        <a className="admin-footer-link" href="/admin">Admin studio</a>
        <span className="footer-note">© 2026 Kora Fragrance House</span>
      </footer>

      {notice && <div className="toast" role="status">{notice}</div>}

      {bagOpen && (
        <div className="bag-layer">
          <button className="bag-scrim" type="button" aria-label="Close shopping bag" onClick={() => setBagOpen(false)} />
          <aside className="bag-drawer" role="dialog" aria-modal="true" aria-labelledby="bag-title">
            <div className="bag-drawer-head"><div><p className="eyebrow">Your selection</p><h2 id="bag-title">The bag <span>({cartCount})</span></h2></div><button type="button" className="close-button" onClick={() => setBagOpen(false)} aria-label="Close bag">×</button></div>
            {cartProducts.length ? (
              <>
                <div className="bag-items">
                  {cartProducts.map((product) => (
                    <div className="bag-item" key={product.id}>
                      <div className="bag-item-art" style={{ backgroundColor: product.backdrop }}><FragranceArt product={product} /></div>
                      <div className="bag-item-detail"><span className="bag-item-family">{product.family} · {product.size}</span><strong>{product.name}</strong><span>{formatPrice(product.price)}</span><div className="quantity-stepper"><button type="button" onClick={() => changeQuantity(product.id, -1)} aria-label={`Remove one ${product.name}`}>−</button><span>{cart[product.id]}</span><button type="button" onClick={() => changeQuantity(product.id, 1)} aria-label={`Add one ${product.name}`}>+</button></div></div>
                      <span className="bag-item-total">{formatPrice(product.price * cart[product.id])}</span>
                    </div>
                  ))}
                </div>
                <div className="bag-summary"><p><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></p><small>Delivery and payment details are confirmed in Telegram.</small><a className="button button-dark bag-checkout" href={telegramCheckoutUrl} target="_blank" rel="noreferrer" aria-label="Review and send your order to KORA on Telegram">Continue in Telegram <span aria-hidden="true">↗</span></a><small className="checkout-note">Your order opens as a draft. Review it and press Send in Telegram.</small></div>
              </>
            ) : (
              <div className="bag-empty"><span className="empty-bag-icon"><BagIcon /></span><h3>Your bag is taking a breather.</h3><p>Find a fragrance that feels like you.</p><button type="button" className="button button-dark" onClick={() => setBagOpen(false)}>Explore the scents <span aria-hidden="true">↗</span></button></div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function App() {
  return /(?:invite|recovery|confirmation|access)_token=/.test(window.location.hash) || window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')
    ? <Admin />
    : <Storefront />
}

export default App
