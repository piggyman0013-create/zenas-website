Zenas.page(async (root, d, s) => {
  const { esc, link, icon, pageHeader, setMeta, $ } = Zenas;
  const b = d.blogBySlug[Zenas.param('slug')];
  const pg = s.pages?.blog?.blocks || {};
  if (!b || b.active === false) {
    root.innerHTML = `<div class="container loading"><h2>Article not found</h2><p><a class="btn btn-primary" href="${link.blog()}">Back to blog</a></p></div>`;
    setMeta({ title: 'Article not found' }, s);
    return;
  }
  setMeta({ title: b.meta_title || b.title, description: b.meta_description || Zenas.stripTags(b.blocks.map((x) => x.html).join(' ')).slice(0, 160), image: b.cover }, s);

  const recent = d.blogs.filter((x) => x.active !== false && x.slug !== b.slug && x.type === 'blog').sort((a, c) => c.id - a.id).slice(0, 5);
  const blocks = `<div class="post-body">${Zenas.blocksHtml(b.blocks)}</div>`;

  const url = encodeURIComponent(location.href);
  root.innerHTML = `
    ${pageHeader({ title: 'Blog', sub: pg.BannersTop1?.sub || '', crumbs: [['Home', link.home()], ['Blog', link.blog()], [b.title]], bg: 'assets/img/header-blog.webp' })}
    <article class="container">
      <div class="post-head">
        <h1>${esc(b.title)}</h1>
        <div class="meta">${esc(b.subtitle).replace(/\s*[|┃]\s*/g, ' &nbsp;|&nbsp; ')}</div>
      </div>
      <div class="share">
        <a href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener">${icon.fb} Share</a>
        <a href="https://social-plugins.line.me/lineit/share?url=${url}" target="_blank" rel="noopener">${icon.line} Share</a>
        <button type="button" id="copy">${icon.share} <span>Share</span></button>
      </div>
      <div class="post-grid">
        <div>
          ${b.cover ? `<img class="post-cover" src="${esc(b.cover)}" alt="${esc(b.title)}">` : ''}
          ${blocks}
        </div>
        <aside class="sidebar">
          <h4>Blog</h4>
          ${recent.map((r) => `<a class="side-post" href="${link.post(r.slug)}">
            <img src="${esc(r.cover)}" alt="${esc(r.title)}" loading="lazy">
            <div class="tag">blog</div><h6>${esc(r.title)}</h6><small>${esc(r.subtitle)}</small></a>`).join('')}
        </aside>
      </div>
    </article>`;

  $('#copy').addEventListener('click', async () => {
    try {
      if (navigator.share) await navigator.share({ title: b.title, url: location.href });
      else { await navigator.clipboard.writeText(location.href); $('#copy span').textContent = 'Link copied'; }
    } catch (e) { /* user cancelled */ }
  });
});
