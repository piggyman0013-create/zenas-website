Zenas.page(async (root, d, s) => {
  const { esc, link, icon, carousel, blogCard, pageHeader, setMeta, $, $$ } = Zenas;
  const pg = s.pages?.blog?.blocks || {};
  setMeta({ title: 'Blog' }, s);

  const live = d.blogs.filter((b) => b.active !== false);
  const posts = live.filter((b) => b.type === 'blog');
  const newest = [...posts].sort((a, b) => b.id - a.id);
  const featured = newest.filter((b) => b.featured);
  const reviews = live.filter((b) => b.type === 'review').sort((a, b) => b.id - a.id);
  const side = newest.slice(0, 2);

  root.innerHTML = `
    ${pageHeader({ title: pg.BannersTop1?.head || 'Blog', sub: pg.BannersTop1?.sub || '', crumbs: [['Home', link.home()], ['Blog']], bg: 'assets/img/header-blog.webp' })}
    <div class="container">
      <div class="blog-top">
        <div class="feat-slider" id="feat">
          <div class="track" style="display:flex;height:100%;transition:transform .7s cubic-bezier(.6,.05,.2,1)">
            ${featured.map((b) => `<div class="slide" style="flex:0 0 100%;position:relative;height:100%">
              <img src="${esc(b.cover)}" alt="${esc(b.title)}" style="width:100%;height:100%;object-fit:cover">
              <a href="${link.post(b.slug)}" aria-label="${esc(b.title)}"></a>
              <div class="cap"><h3>${esc(b.title)}</h3><small>${esc(b.subtitle)}</small></div>
            </div>`).join('')}
          </div>
          <div class="bars left">${featured.map((_, i) => `<button aria-label="Slide ${i + 1}"></button>`).join('')}</div>
          <div class="feat-nav"><button class="prev" aria-label="Previous">${icon.left}</button><button class="next" aria-label="Next">${icon.right}</button></div>
        </div>
        <div class="side-cards">
          ${side.map((b, i) => `<a class="side-card ${i === 0 ? 'grad' : 'img'}" href="${link.post(b.slug)}">
            ${i ? `<img class="bg" src="${esc(b.cover)}" alt="" loading="lazy">` : ''}
            <span class="go">${icon.arrowUpRight}</span>
            <h3>${esc(b.title)}</h3><small>${esc(b.subtitle)}</small>
          </a>`).join('')}
        </div>
      </div>

      ${reviews.length ? `<h2 class="h-section">Product reviews</h2><div id="reviews"></div>` : ''}

      <h2 class="h-section" style="margin-top:36px">Blogs</h2>
      <div class="b-grid">${posts.map(blogCard).join('')}</div>
    </div>`;

  // featured slider (custom chrome to match the original)
  const el = $('#feat'), track = $('.track', el), bars = $$('.bars button', el);
  let i = 0, t;
  const go = (n) => { i = (n + featured.length) % featured.length; track.style.transform = `translateX(-${i * 100}%)`; bars.forEach((b, k) => b.classList.toggle('on', k === i)); };
  const play = () => { clearInterval(t); t = setInterval(() => go(i + 1), 5000); };
  $('.prev', el).onclick = () => { go(i - 1); play(); };
  $('.next', el).onclick = () => { go(i + 1); play(); };
  bars.forEach((b, k) => (b.onclick = () => { go(k); play(); }));
  if (featured.length) { go(0); play(); } else el.remove();

  if (reviews.length) {
    carousel($('#reviews'), reviews.map((b) => `<a class="review-card" href="${link.post(b.slug)}">
      <img src="${esc(b.cover)}" alt="${esc(b.title)}" loading="lazy">
      <div><h5>${esc(b.title)}</h5><small>${esc(b.subtitle)}</small></div></a>`), { perView: (w) => (w < 560 ? 1 : w < 900 ? 2 : 3), light: true });
  }
});
