Zenas.page(async (root, d, s) => {
  const { esc, link, slider, carousel, blogCard, blocksHtml, ytEmbed, setMeta, $ } = Zenas;
  const p = d.productBySlug[Zenas.param('slug')];
  if (!p || p.active === false) {
    root.innerHTML = `<div class="container loading"><h2>Product not found</h2><p><a class="btn btn-primary" href="${link.products()}">See all products</a></p></div>`;
    setMeta({ title: 'Product not found' }, s);
    return;
  }
  setMeta({ title: p.meta_title || p.title, description: p.meta_description || Zenas.stripTags(p.about_html).slice(0, 160), keywords: p.meta_keywords, image: p.cover }, s);

  const parent = p.parent ? d.productById[p.parent] : null;
  const family = parent || p;
  const kids = d.children(family);
  const cat = d.catBySlug[p.categories[0]];
  const crumbs = [`<a href="${link.home()}">Home</a>`, `<a href="${link.products()}">Products</a>`];
  if (cat) crumbs.push(`<a href="${link.products(cat.slug)}">${esc(cat.title)}</a>`);
  if (parent) crumbs.push(`<a href="${link.product(parent.slug)}">${esc(parent.title)}</a>`);
  crumbs.push(`<b>${esc(p.title)}</b>`);

  const gallery = p.gallery.length ? p.gallery : (parent?.gallery.length ? parent.gallery : [p.cover]);
  const related = p.related_blogs.map((sl) => d.blogBySlug[sl]).filter((b) => b && b.active !== false);

  root.innerHTML = `
    <section class="pd-hero" id="gal"></section>
    <div class="crumb-wrap"><div class="crumb"></div><div class="crumb-text">${crumbs.join(' / ')}</div></div>

    <section class="pd-head">
      <div class="container row">
        <div><h2>${esc(p.title)}</h2><div class="sub">${esc(p.subtitle)}</div></div>
        ${p.catalog ? `<a class="btn btn-outline" href="${esc(p.catalog)}" target="_blank" rel="noopener" download>Download Catalog</a>` : ''}
      </div>
    </section>

    <section class="pd-about">
      <div class="container">
        ${kids.length ? `<div class="chips">${kids.map((k) => `<a href="${link.product(k.slug)}" class="${k.slug === p.slug ? 'on' : ''}">${esc(k.title)}</a>`).join('')}</div>` : ''}
        <div class="grid">
          <div>
            ${p.about_html && Zenas.stripTags(p.about_html).trim() ? `<h5>About Product</h5><div class="text rich">${p.about_html}</div>` : `<h5>${esc(p.title)}</h5><div class="text">${esc(p.subtitle)}</div>`}
          </div>
          ${p.youtube ? `<div class="clip-video"><iframe src="${ytEmbed(p.youtube)}" title="${esc(p.title)} video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>` : `<div><img src="${esc(p.cover)}" alt="${esc(p.title)}" style="max-height:320px;margin:auto"></div>`}
        </div>
      </div>
    </section>

    <div class="blocks">${blocksHtml(p.blocks)}</div>

    ${related.length ? `
    <div class="notch light" style="--notch-bg:var(--light-bg)"><span>Blogs</span></div>
    <section class="section-tab"><div class="container"><div id="rel"></div></div></section>` : ''}
  `;

  slider($('#gal'), gallery.map((src) => ({ image: src, title: p.title })), { barsLeft: true });
  if (related.length) carousel($('#rel'), related.map(blogCard), { perView: (w) => (w < 560 ? 2 : w < 900 ? 3 : 4), light: true });
});
