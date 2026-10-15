/* Zenas Technology — shared runtime: data loading, layout (header/footer), components. */
(function () {
  'use strict';

  const DATA_FILES = ['settings', 'banners', 'categories', 'products', 'blogs'];
  const VERSION = document.documentElement.dataset.v || '1';

  // ---------- helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const param = (k) => new URLSearchParams(location.search).get(k);
  const telHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
  const ytId = (v) => {
    if (!v) return '';
    const m = String(v).match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    return m ? m[1] : String(v).trim();
  };
  const ytEmbed = (id) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId(id))}`;

  const routes = {
    '/': 'index.html', '/products': 'products.html', '/blog': 'blog.html', '/contact-us': 'contact.html',
  };
  const link = {
    home: () => 'index.html',
    products: (cat) => 'products.html' + (cat ? '?cat=' + encodeURIComponent(cat) : ''),
    product: (slug) => 'product.html?slug=' + encodeURIComponent(slug),
    blog: () => 'blog.html',
    post: (slug) => 'post.html?slug=' + encodeURIComponent(slug),
    contact: () => 'contact.html',
    nav: (uri) => routes[uri] || uri,
  };

  const icon = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    fax: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.8a7 7 0 0 1 11.6 0"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    arrowUpRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    fb: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path fill="#fff" d="M13.4 19v-6.2h2.1l.3-2.5h-2.4V8.8c0-.7.2-1.2 1.2-1.2h1.3V5.4a17 17 0 0 0-1.9-.1c-1.9 0-3.2 1.2-3.2 3.3v1.8H8.7v2.5h2.1V19z"/></svg>',
    line: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#06C755"/><path fill="#fff" d="M19 11.3c0-3.1-3.1-5.6-7-5.6s-7 2.5-7 5.6c0 2.8 2.5 5.1 5.8 5.5.2 0 .5.2.6.4.1.2 0 .5 0 .7l-.1.6c0 .2-.2.7.6.4.8-.3 4.3-2.5 5.8-4.3 1-1.1 1.3-2.2 1.3-3.3z"/></svg>',
  };

  // ---------- data ----------
  let _data = null;
  async function loadData() {
    if (_data) return _data;
    try {
      if (location.protocol === 'file:') throw new Error('file mode');
      const entries = await Promise.all(DATA_FILES.map(async (n) => {
        const r = await fetch(`data/${n}.json?v=${VERSION}`, { cache: 'no-cache' });
        if (!r.ok) throw new Error(`Cannot load data/${n}.json (${r.status})`);
        return [n, await r.json()];
      }));
      _data = Object.fromEntries(entries);
    } catch (err) {
      // Opened by double-click (file://) or JSON blocked: fall back to data/bundle.js (same data as a script)
      await new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = `data/bundle.js?v=${VERSION}`; sc.onload = res; sc.onerror = () => rej(err);
        document.head.appendChild(sc);
      });
      if (!window.ZENAS_DATA) throw err;
      _data = JSON.parse(JSON.stringify(window.ZENAS_DATA));
    }
    const d = _data;
    d.productBySlug = Object.fromEntries(d.products.map((p) => [p.slug, p]));
    d.productById = Object.fromEntries(d.products.map((p) => [p.id, p]));
    d.blogBySlug = Object.fromEntries(d.blogs.map((b) => [b.slug, b]));
    d.catBySlug = Object.fromEntries(d.categories.map((c) => [c.slug, c]));
    d.topProducts = d.products.filter((p) => !p.parent && p.active !== false).sort((a, b) => a.order - b.order);
    d.children = (p) => d.products.filter((c) => c.parent === p.id && c.active !== false).sort((a, b) => a.order - b.order || a.id - b.id);
    d.visibleCats = d.categories.filter((c) => c.active !== false).sort((a, b) => a.order - b.order);
    return d;
  }

  // ---------- meta ----------
  function setMeta({ title, description, keywords, image } = {}, s) {
    const site = s?.site_name || 'Zenas Technology.';
    document.title = title ? `${title} | ${site}` : (s?.meta_title || site);
    const put = (attr, key, val) => {
      if (!val) return;
      let m = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!m) { m = document.createElement('meta'); m.setAttribute(attr, key); document.head.appendChild(m); }
      m.setAttribute('content', val);
    };
    put('name', 'description', description || s?.meta_description);
    put('name', 'keywords', keywords || s?.meta_keywords);
    put('property', 'og:title', document.title);
    put('property', 'og:description', description || s?.meta_description);
    if (image) put('property', 'og:image', new URL(image, location.href).href);
  }

  // ---------- layout ----------
  function header(s, active) {
    const nav = s.nav.filter((n) => n.group === 'header');
    const items = nav.map((n) => {
      const href = link.nav(n.uri);
      return `<a href="${href}" class="${href === active ? 'active' : ''}">${esc(n.title)}</a>`;
    }).join('');
    return `
<header class="site-header">
  <div class="container">
    <a class="logo" href="index.html" aria-label="Zenas Technology home"><img src="assets/img/logo.png" alt="Zenas Technology" width="105" height="48"></a>
    <nav class="main-nav" aria-label="Main">${items}</nav>
    <div class="header-actions">
      <span class="lang-pill" title="Language"><span class="globe">${icon.globe}</span>EN</span>
      <a class="btn btn-primary" href="${telHref(s.phone)}">${icon.phone}<span>Call Now</span></a>
      <button class="burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>
<nav class="mobile-nav" aria-label="Mobile">${items}</nav>`;
  }

  function contactBand(s) {
    return `
<div class="notch dark"><span>Contact Us</span></div>
<section class="contact-band">
  <div class="container grid">
    <div>
      <h3>${esc(s.pages?.home?.blocks?.ContactContent1?.head?.replace(/<br\s*\/?>/gi, ' ') || 'We’re Delivering the Best Customer Experience')}</h3>
      <a class="btn btn-primary" href="${telHref(s.phone)}">Call us now</a>
    </div>
    <div>
      <h4>Address</h4>
      <div class="small">${addressHtml(s)}</div>
    </div>
    <div>
      <h4>Contact Us</h4>
      <ul class="info-list">
        <li>${icon.phone}<a href="${telHref(s.phone)}">${esc(s.phone)}</a></li>
        <li>${icon.fax}${esc(s.fax)}</li>
        <li>${icon.mail}<a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>
      </ul>
      <h4 style="margin-top:18px">Social</h4>
      ${socials(s)}
    </div>
  </div>
</section>`;
  }

  function addressHtml(s) {
    return `${esc(s.company_name_long || 'Zenas Technology Company Limited')}<br>${esc(s.address || '129/196 Soi Nawamin163 Nuanchan Beungkum BANGKOK 10230 THAILAND')}<br><br>TAX ID: ${esc(s.tax_id)}`;
  }

  function socials(s) {
    return `<div class="socials">${(s.socials || []).map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="${esc(x.name)}"><img src="${esc(x.icon)}" alt="${esc(x.name)}" loading="lazy"></a>`).join('')}</div>`;
  }

  function mapBlock(s) {
    if (!s.google_map_embed) return '';
    return `<section class="map"><iframe src="${esc(s.google_map_embed)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map"></iframe></section>`;
  }

  function footer(s, d) {
    const nav = s.nav.filter((n) => n.group === 'footer');
    return `
<div class="notch navy back-top"><span><button type="button" data-top>${icon.up} Back to top</button></span></div>
<footer class="site-footer">
  <div class="container grid">
    <div><img class="logo-w" src="assets/img/logo-white.png" alt="Zenas Technology" loading="lazy"></div>
    <nav aria-label="Footer">${nav.map((n) => `<a href="${link.nav(n.uri)}">${esc(n.title)}</a>`).join('')}</nav>
    <div class="cats"><strong>Product Categories</strong>${d.visibleCats.map((c) => `<a href="${link.products(c.slug)}">${esc(c.title)}</a>`).join('')}</div>
    <div>
      <div>Social</div>
      ${socials(s)}
      <div class="help">We're here to help.</div>
      <a class="btn btn-outline-white" href="${telHref(s.phone)}">Call us now</a>
    </div>
  </div>
  <div class="container legal">
    <div></div>
    <a href="terms.html">Terms &amp; Conditions</a>
    <a href="privacy.html">Privacy Policy</a>
    <div>© ${new Date().getFullYear()} Zenas Technology, All Rights Reserved</div>
  </div>
</footer>`;
  }

  function pageHeader({ title, sub, crumbs, bg }) {
    const c = crumbs.map((x, i) => (i === crumbs.length - 1 ? `<b>${esc(x[0])}</b>` : `<a href="${x[1]}">${esc(x[0])}</a>`)).join(' / ');
    return `
<section class="page-header" style="background-image:url('${bg || 'assets/img/header-products.webp'}')">
  <div class="container"><h1>${esc(title)}</h1><p>${esc(sub || '')}</p></div>
</section>
<div class="crumb-wrap"><div class="crumb"></div><div class="crumb-text">${c}</div></div>`;
  }

  // ---------- components ----------
  /** Full-width slider. slides: [{image, title, subtitle, link}] */
  function slider(el, slides, { captions = false, interval = 5000, barsLeft = false } = {}) {
    if (!slides.length) { el.remove(); return; }
    el.classList.add('slider');
    el.innerHTML = `
      <div class="track">${slides.map((s, i) => `
        <div class="slide">
          <img src="${esc(s.image)}" alt="${esc(s.title || '')}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>
          ${captions && (s.title || s.subtitle) ? `<div class="caption"><h2>${esc(s.title)}</h2><p>${esc(s.subtitle)}</p>${s.link ? `<a class="btn btn-primary" href="${esc(s.link)}">Read More</a>` : ''}</div>` : ''}
        </div>`).join('')}</div>
      ${slides.length > 1 ? `<button class="arrow prev" aria-label="Previous">${icon.left}</button><button class="arrow next" aria-label="Next">${icon.right}</button>
      <div class="bars ${barsLeft ? 'left' : ''}">${slides.map((_, i) => `<button aria-label="Slide ${i + 1}"></button>`).join('')}</div>` : ''}`;
    const track = $('.track', el);
    const bars = $$('.bars button', el);
    let i = 0, timer;
    const go = (n) => {
      i = (n + slides.length) % slides.length;
      track.style.transform = `translateX(-${i * 100}%)`;
      bars.forEach((b, k) => b.classList.toggle('on', k === i));
    };
    const play = () => { clearInterval(timer); if (slides.length > 1) timer = setInterval(() => go(i + 1), interval); };
    $('.prev', el)?.addEventListener('click', () => { go(i - 1); play(); });
    $('.next', el)?.addEventListener('click', () => { go(i + 1); play(); });
    bars.forEach((b, k) => b.addEventListener('click', () => { go(k); play(); }));
    swipe(el, (dir) => { go(i + dir); play(); });
    go(0); play();
    return { go: (n) => { go(n); play(); }, next: () => { go(i + 1); play(); }, prev: () => { go(i - 1); play(); } };
  }

  /** Multi-item carousel with dots. perView: function(width) -> n */
  function carousel(el, itemsHtml, { perView = () => 3, interval = 6000, light = false } = {}) {
    el.classList.add('carousel');
    if (light) el.classList.add('on-light');
    el.innerHTML = `<div class="track">${itemsHtml.join('')}</div><div class="dots"></div>`;
    const track = $('.track', el), dotsEl = $('.dots', el);
    let page = 0, pages = 1, timer;
    const layout = () => {
      const n = perView(el.clientWidth);
      pages = Math.max(1, Math.ceil(itemsHtml.length / n));
      dotsEl.innerHTML = pages > 1 ? Array.from({ length: pages }, (_, k) => `<button aria-label="Page ${k + 1}"></button>`).join('') : '';
      $$('button', dotsEl).forEach((b, k) => b.addEventListener('click', () => { go(k); play(); }));
      go(Math.min(page, pages - 1));
    };
    const go = (p) => {
      page = (p + pages) % pages;
      const first = track.children[0];
      if (!first) return;
      const n = perView(el.clientWidth);
      const step = first.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 14);
      const maxShift = Math.max(0, track.scrollWidth - el.clientWidth);
      track.style.transform = `translateX(-${Math.min(page * n * step, maxShift)}px)`;
      $$('button', dotsEl).forEach((b, k) => b.classList.toggle('on', k === page));
    };
    const play = () => { clearInterval(timer); if (pages > 1) timer = setInterval(() => go(page + 1), interval); };
    swipe(el, (dir) => { go(page + dir); play(); });
    window.addEventListener('resize', debounce(layout, 150));
    layout(); play();
  }

  function swipe(el, cb) {
    let x0 = null;
    el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) cb(dx < 0 ? 1 : -1);
      x0 = null;
    });
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function productCard(p) {
    const sub = (p.subtitle || '').trim();
    return `<a class="p-card" href="${link.product(p.slug)}">
      <div class="thumb"><img src="${esc(p.cover)}" alt="${esc(p.title)}" loading="lazy"></div>
      <div class="body"><h4>${esc(p.title)}</h4><small>${esc(sub)}${sub ? '....' : ''}</small></div>
    </a>`;
  }

  function blogCard(b) {
    return `<a class="blog-card" href="${link.post(b.slug)}">
      <div class="thumb"><img src="${esc(b.cover)}" alt="${esc(b.title)}" loading="lazy"></div>
      <h5>${esc(b.title)}</h5>
      <div class="meta">${esc(b.subtitle)}</div>
    </a>`;
  }

  /** Content block renderer shared by products & posts. layout: 1 dark split, 2 image-left, 3 image-right, 4 centered */
  function blocksHtml(blocks) {
    return (blocks || []).filter((b) => b.active !== false && (b.image || b.title || stripTags(b.html).trim())).map((b) => {
      const hasMedia = !!b.image;
      const media = hasMedia ? `<div class="media"><img src="${esc(b.image)}" alt="${esc(b.title || '')}" loading="lazy"></div>` : '';
      const text = (b.title || b.html) ? `<div class="txt">${b.title ? `<h3>${esc(b.title)}</h3>` : ''}<div class="html rich">${b.html || ''}</div></div>` : '';
      const layout = [1, 2, 3, 4].includes(+b.layout) ? +b.layout : 4;
      return `<section class="blk l${layout} ${hasMedia ? '' : 'no-media'}"><div class="container">${media}${text}</div></section>`;
    }).join('');
  }

  function stripTags(h) { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent || ''; }

  // ---------- boot ----------
  async function page(render, { active = '' } = {}) {
    const root = $('#app');
    try {
      const d = await loadData();
      const s = d.settings;
      document.body.insertAdjacentHTML('afterbegin', header(s, active || location.pathname.split('/').pop() || 'index.html'));
      await render(root, d, s);
      root.insertAdjacentHTML('afterend', footer(s, d));
      setupChrome();
    } catch (err) {
      console.error(err);
      root.innerHTML = `<div class="container loading">Sorry, this page could not be loaded.<br><small>${esc(err.message)}</small></div>`;
    }
  }

  function setupChrome() {
    const burger = $('.burger'), mnav = $('.mobile-nav');
    burger?.addEventListener('click', () => {
      const open = mnav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open);
    });
    $$('[data-top]').forEach((b) => b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' })));
  }

  window.Zenas = {
    $, $$, esc, param, link, icon, telHref, ytEmbed, ytId, setMeta, page, slider, carousel, productCard, blogCard,
    blocksHtml, contactBand, mapBlock, pageHeader, addressHtml, socials, stripTags, loadData,
  };
})();
