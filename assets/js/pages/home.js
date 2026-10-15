Zenas.page(async (root, d, s) => {
  const { esc, link, slider, carousel, productCard, contactBand, mapBlock, ytEmbed, setMeta } = Zenas;
  const home = s.pages?.home?.blocks || {};
  const about = home.ContentsContent4 || {};
  const feat = home.ProductsFeature1 || {};
  setMeta({}, s);

  const cats = d.visibleCats;
  root.innerHTML = `
    <section class="hero" id="hero"></section>

    <section class="cat-strip" style="--n:${cats.length}">
      ${cats.map((c) => `<a class="cat-tile" href="${link.products(c.slug)}"><img src="${esc(c.image)}" alt="${esc(c.title)}" loading="lazy"><span>${esc(c.title)}</span></a>`).join('')}
    </section>

    <section class="about">
      <div class="container grid">
        <div>
          <div class="eyebrow">${esc(about.head || 'About Us')}</div>
          <h3>${esc(about.sub_head || '')}</h3>
          <div class="text rich">${about.description || ''}</div>
          <div class="actions">
            <a class="btn btn-primary" href="${link.contact()}">Read More</a>
            ${s.catalog_pdf ? `<a class="btn btn-outline" href="${esc(s.catalog_pdf)}" target="_blank" rel="noopener" download>Download Catalog</a>` : ''}
          </div>
        </div>
        ${s.youtube_intro ? `<div class="clip-video"><iframe src="${ytEmbed(s.youtube_intro)}" title="Zenas Technology" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>` : ''}
      </div>
    </section>

    <div class="notch light"><span>${esc(home.OurclientsLists2?.head || 'Our Partners')}</span></div>
    <section class="partners"><div class="marquee" id="marquee"></div></section>

    <section class="featured halftone">
      <div class="grid">
        <div class="intro">
          <h2>${feat.head || 'Features<br>Products'}</h2>
          <p>${feat.sub_head || ''}</p>
          <a class="btn btn-primary" href="${link.products()}">View All</a>
        </div>
        <div id="feat"></div>
      </div>
    </section>

    ${contactBand(s)}
    ${mapBlock(s)}
  `;

  // hero: desktop banners, mobile banners on narrow screens
  const mobile = window.matchMedia('(max-width: 767px)').matches && d.banners.hero_mobile?.length;
  slider(Zenas.$('#hero'), (mobile ? d.banners.hero_mobile : d.banners.hero).filter((b) => b.image), { captions: true });

  // partners: duplicate the list so the marquee loops seamlessly
  const logos = d.banners.partners.filter(Boolean);
  Zenas.$('#marquee').innerHTML = [...logos, ...logos].map((src) => `<img src="${esc(src)}" alt="Partner" loading="lazy">`).join('');

  const featured = d.topProducts.filter((p) => p.featured).slice(0, +feat.limit || 4);
  carousel(Zenas.$('#feat'), featured.map(productCard), { perView: (w) => (w < 560 ? 2 : 3) });
});
