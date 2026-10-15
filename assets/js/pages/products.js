Zenas.page(async (root, d, s) => {
  const { esc, link, productCard, pageHeader, setMeta, $, $$ } = Zenas;
  const pg = s.pages?.products?.blocks || {};
  setMeta({ title: 'Products' }, s);

  root.innerHTML = `
    ${pageHeader({ title: pg.BannersTop1?.head || 'All Products', sub: pg.BannersTop1?.sub || 'product', crumbs: [['Home', link.home()], ['Products']] })}
    <div class="container page-title"><h2>${esc(pg.BreadcrumbList2?.title || 'Product Category')}</h2></div>
    <section class="product-area">
      <div class="container">
        <div class="filters" role="tablist">
          <button data-cat="" role="tab">All</button>
          ${d.visibleCats.map((c) => `<button data-cat="${esc(c.slug)}" role="tab">${esc(c.title)}</button>`).join('')}
        </div>
        <div class="p-grid" id="grid"></div>
      </div>
    </section>`;

  const grid = $('#grid');
  const render = (cat) => {
    const list = d.topProducts.filter((p) => !cat || p.categories.includes(cat));
    grid.innerHTML = list.length ? list.map(productCard).join('') : '<div class="empty">No products in this category yet.</div>';
    $$('.filters button').forEach((b) => b.classList.toggle('on', b.dataset.cat === (cat || '')));
    const c = d.catBySlug[cat];
    setMeta({ title: c ? `${c.title} — Products` : 'Products', description: c?.description }, s);
  };
  $$('.filters button').forEach((b) => b.addEventListener('click', () => {
    const cat = b.dataset.cat;
    history.replaceState(null, '', cat ? `?cat=${encodeURIComponent(cat)}` : 'products.html');
    render(cat);
  }));
  // support both ?cat= (new) and ?slug= (old site's links)
  render(Zenas.param('cat') || Zenas.param('slug') || '');
});
