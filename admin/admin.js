/* Zenas admin — edits the site's data/*.json and media, then commits everything to GitHub in one commit. */
(function () {
  'use strict';
  const FILES = ['settings', 'banners', 'categories', 'products', 'blogs'];
  const LS_KEY = 'zenas-admin-cfg';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ก-๙]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item-' + Date.now();
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const state = { cfg: null, preview: false, data: null, dirty: new Set(), uploads: new Map(), tab: 'products' };

  // ---------------- toast ----------------
  let toastT;
  function toast(msg, kind = '') {
    const t = $('#toast');
    t.className = 'toast ' + kind; t.textContent = msg;
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), kind === 'err' ? 8000 : 3500);
  }

  // ---------------- GitHub API ----------------
  async function gh(method, path, body, accept) {
    const { owner, repo, token } = state.cfg;
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const j = await r.json(); msg = j.message || msg; } catch (e) { /* ignore */ }
      if (r.status === 401) msg = 'Token ไม่ถูกต้องหรือหมดอายุ';
      if (r.status === 404) msg = 'ไม่พบ repository/branch/ไฟล์ — ตรวจชื่อ owner, repo, branch และสิทธิ์ของ token';
      if (r.status === 403) msg = 'Token ไม่มีสิทธิ์เขียน (ต้องเป็น Contents: Read and write) — ' + msg;
      throw new Error(msg);
    }
    return accept && accept.includes('raw') ? r.text() : r.json();
  }
  const repoPath = (p) => (state.cfg.prefix ? state.cfg.prefix.replace(/^\/+|\/+$/g, '') + '/' : '') + p;

  async function loadData() {
    const out = {};
    await Promise.all(FILES.map(async (n) => {
      if (state.preview) {
        const r = await fetch(`../data/${n}.json?t=${Date.now()}`);
        if (!r.ok) throw new Error(`โหลด data/${n}.json ไม่ได้`);
        out[n] = await r.json();
      } else {
        const txt = await gh('GET', `/contents/${encodeURI(repoPath(`data/${n}.json`))}?ref=${encodeURIComponent(state.cfg.branch)}`, null, 'application/vnd.github.raw+json');
        out[n] = JSON.parse(txt);
      }
    }));
    return out;
  }

  const b64 = (buf) => {
    let s = ''; const bytes = new Uint8Array(buf); const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(s);
  };

  async function publish() {
    if (state.preview) { toast('โหมดดูอย่างเดียว — ใช้ "ดาวน์โหลด JSON" แทน', 'err'); return; }
    const files = [];
    for (const n of state.dirty) files.push({ path: repoPath(`data/${n}.json`), content: JSON.stringify(state.data[n], null, 1) + '\n', encoding: 'utf-8' });
    if (state.dirty.size) files.push({ path: repoPath('data/bundle.js'), content: 'window.ZENAS_DATA=' + JSON.stringify(Object.fromEntries(FILES.map((n) => [n, state.data[n]]))) + ';\n', encoding: 'utf-8' });
    for (const [p, u] of state.uploads) if (!u.published) files.push({ path: repoPath(p), blob: u.blob, encoding: 'base64' });
    if (!files.length) return;
    const btn = $('#publishBtn'); btn.disabled = true; btn.textContent = 'กำลังเผยแพร่…';
    try {
      const { branch } = state.cfg;
      const ref = await gh('GET', `/git/ref/heads/${encodeURIComponent(branch)}`);
      const head = await gh('GET', `/git/commits/${ref.object.sha}`);
      const tree = [];
      for (const f of files) {
        const content = f.encoding === 'base64' ? b64(await f.blob.arrayBuffer()) : f.content;
        const blob = await gh('POST', '/git/blobs', { content, encoding: f.encoding });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const newTree = await gh('POST', '/git/trees', { base_tree: head.tree.sha, tree });
      const summary = [...state.dirty].join(', ') + (state.uploads.size ? ` + ${[...state.uploads.values()].filter((u) => !u.published).length} ไฟล์` : '');
      const commit = await gh('POST', '/git/commits', { message: `Update website content (${summary}) via admin`, tree: newTree.sha, parents: [ref.object.sha] });
      await gh('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
      state.dirty.clear();
      for (const u of state.uploads.values()) u.published = true;
      updateDirty();
      toast('เผยแพร่แล้ว ✓ หน้าเว็บจะอัปเดตภายใน 1–2 นาที', 'ok');
    } catch (e) {
      console.error(e);
      toast('เผยแพร่ไม่สำเร็จ: ' + e.message, 'err');
    } finally {
      btn.textContent = 'เผยแพร่การเปลี่ยนแปลง'; updateDirty();
    }
  }

  function exportJson() {
    const names = state.dirty.size ? [...state.dirty] : FILES;
    for (const n of names) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(state.data[n], null, 1) + '\n'], { type: 'application/json' }));
      a.download = `${n}.json`; a.click();
    }
    if (state.uploads.size) toast('ไฟล์รูปที่อัปโหลดใหม่ต้องคัดลอกเข้าโฟลเดอร์ media/ เอง (ในโหมดนี้)', '');
  }

  function markDirty(name) { state.dirty.add(name); updateDirty(); }
  function updateDirty() {
    const pending = state.dirty.size + [...state.uploads.values()].filter((u) => !u.published).length;
    const pill = $('#dirty');
    pill.classList.toggle('hidden', !pending);
    pill.textContent = `ยังไม่เผยแพร่ ${pending} รายการ`;
    $('#publishBtn').disabled = !pending || state.preview;
  }
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty.size) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------------- media ----------------
  const src = (p) => (!p ? '' : state.uploads.has(p) ? state.uploads.get(p).url : /^https?:/.test(p) ? p : '../' + p);

  async function processUpload(file, folder) {
    const base = slugify(file.name.replace(/\.[^.]+$/, '')).replace(/[^a-z0-9-]/g, '') || 'file';
    const stamp = Date.now();
    let blob = file, ext = (file.name.split('.').pop() || '').toLowerCase();
    if (file.type.startsWith('image/') && !/gif|svg/.test(file.type)) {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      blob = await new Promise((res) => c.toBlob(res, 'image/webp', 0.82));
      ext = 'webp';
      if (!blob || blob.type !== 'image/webp') { blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85)); ext = 'jpg'; }
    }
    if (blob.size > 45 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 45 MB');
    const path = `media/${folder}/${stamp}-${base}.${ext}`;
    state.uploads.set(path, { blob, url: URL.createObjectURL(blob), published: false });
    updateDirty();
    return path;
  }

  function pickFile(accept) {
    return new Promise((res) => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
      i.onchange = () => res(i.files[0] || null); i.click();
    });
  }

  // ---------------- field builders (each returns {el, get}) ----------------
  const F = {
    text(label, value, opts = {}) {
      const el = h(`<label>${esc(label)}<input value="${esc(value)}" ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}>${opts.hint ? `<span class="hint">${esc(opts.hint)}</span>` : ''}</label>`);
      return { el, get: () => $('input', el).value.trim(), input: $('input', el) };
    },
    area(label, value, opts = {}) {
      const el = h(`<label>${esc(label)}<textarea rows="${opts.rows || 3}">${esc(value)}</textarea>${opts.hint ? `<span class="hint">${esc(opts.hint)}</span>` : ''}</label>`);
      return { el, get: () => $('textarea', el).value };
    },
    num(label, value) {
      const el = h(`<label>${esc(label)}<input type="number" value="${esc(value ?? 0)}"></label>`);
      return { el, get: () => Number($('input', el).value) || 0 };
    },
    check(label, value) {
      const el = h(`<label class="check"><input type="checkbox" ${value ? 'checked' : ''}> ${esc(label)}</label>`);
      return { el, get: () => $('input', el).checked };
    },
    select(label, value, options) {
      const el = h(`<label>${esc(label)}<select>${options.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`);
      return { el, get: () => $('select', el).value };
    },
    checks(label, values, options) {
      const el = h(`<div><div style="font-size:13px;margin-bottom:6px">${esc(label)}</div><div class="checks">${options.map(([v, t]) => `<label><input type="checkbox" value="${esc(v)}" ${values.includes(v) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div></div>`);
      return { el, get: () => $$('input:checked', el).map((i) => i.value) };
    },
    html(label, value) {
      const el = h(`<div><div style="font-size:13px;margin-bottom:6px">${esc(label)}</div><div class="q"></div></div>`);
      const q = new Quill($('.q', el), {
        theme: 'snow',
        modules: { toolbar: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline'], [{ color: [] }], [{ list: 'ordered' }, { list: 'bullet' }], [{ align: [] }], ['link'], ['clean']] },
      });
      // set the DOM directly: clipboard conversion needs the editor attached to compute block styles
      q.root.innerHTML = value || '';
      q.update('silent');
      q.history.clear();
      return { el, get: () => { const v = q.root.innerHTML; return v === '<p><br></p>' ? '' : v; } };
    },
    file(label, value, { folder = 'products', accept = 'image/*', kind = 'image' } = {}) {
      let cur = value || '';
      const el = h(`<div><div style="font-size:13px;margin-bottom:6px">${esc(label)}</div><div class="img-field"><div class="pv"></div><div><div class="acts"><button type="button" class="btn sm up">อัปโหลด</button><button type="button" class="btn sm danger rm">ลบ</button></div><div class="hint path"></div></div></div></div>`);
      const pv = $('.pv', el), path = $('.path', el);
      const paint = () => {
        if (kind === 'pdf') { pv.classList.add('pdf'); pv.innerHTML = cur ? `<a href="${esc(src(cur))}" target="_blank">เปิด PDF</a>` : 'ไม่มีไฟล์'; }
        else pv.style.backgroundImage = cur ? `url("${src(cur)}")` : 'none';
        path.textContent = cur || 'ยังไม่มีไฟล์';
      };
      $('.up', el).onclick = async () => {
        const f = await pickFile(accept); if (!f) return;
        try { cur = await processUpload(f, folder); paint(); } catch (e) { toast(e.message, 'err'); }
      };
      $('.rm', el).onclick = () => { cur = ''; paint(); };
      paint();
      return { el, get: () => cur };
    },
    gallery(label, list, folder = 'products') {
      let items = [...(list || [])];
      const el = h(`<div><div style="font-size:13px;margin-bottom:6px">${esc(label)}</div><div class="gallery"></div><button type="button" class="btn sm add" style="margin-top:8px">+ เพิ่มรูป</button></div>`);
      const g = $('.gallery', el);
      const paint = () => {
        g.innerHTML = items.map((p, i) => `<div class="g"><img src="${esc(src(p))}" alt=""><div class="acts"><button type="button" class="btn sm" data-l="${i}">◀</button><button type="button" class="btn sm" data-r="${i}">▶</button><button type="button" class="btn sm danger" data-x="${i}">✕</button></div></div>`).join('') || '<span class="hint">ยังไม่มีรูป</span>';
      };
      g.onclick = (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const i = +(b.dataset.l ?? b.dataset.r ?? b.dataset.x);
        if (b.dataset.x !== undefined) items.splice(i, 1);
        if (b.dataset.l !== undefined && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
        if (b.dataset.r !== undefined && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
        paint();
      };
      $('.add', el).onclick = async () => {
        const f = await pickFile('image/*'); if (!f) return;
        try { items.push(await processUpload(f, folder)); paint(); } catch (e) { toast(e.message, 'err'); }
      };
      paint();
      return { el, get: () => items };
    },
    /** repeatable list of sub-forms. make(item) -> {el, get} */
    list(label, items, make, blank, addLabel = '+ เพิ่ม') {
      const rows = [];
      const el = h(`<div><h3>${esc(label)}</h3><div class="rows" style="display:grid;gap:10px"></div><button type="button" class="btn sm add" style="margin-top:10px">${esc(addLabel)}</button></div>`);
      const box = $('.rows', el);
      const add = (item) => {
        const f = make(item);
        const wrap = h(`<div class="block"><div class="block-head"><b class="n"></b><div class="acts"><button type="button" class="btn sm up">▲</button><button type="button" class="btn sm dn">▼</button><button type="button" class="btn sm danger rm">ลบ</button></div></div></div>`);
        wrap.appendChild(f.el);
        const row = { wrap, f };
        $('.up', wrap).onclick = () => { const i = rows.indexOf(row); if (i > 0) { rows.splice(i, 1); rows.splice(i - 1, 0, row); renum(); } };
        $('.dn', wrap).onclick = () => { const i = rows.indexOf(row); if (i < rows.length - 1) { rows.splice(i, 1); rows.splice(i + 1, 0, row); renum(); } };
        $('.rm', wrap).onclick = () => { if (confirm('ลบรายการนี้?')) { rows.splice(rows.indexOf(row), 1); renum(); } };
        rows.push(row); renum();
      };
      const renum = () => { box.innerHTML = ''; rows.forEach((r, i) => { $('.n', r.wrap).textContent = `#${i + 1}`; box.appendChild(r.wrap); }); };
      (items || []).forEach(add);
      $('.add', el).onclick = () => add(clone(blank));
      return { el, get: () => rows.map((r) => r.f.get()) };
    },
    group(fields, cls = 'grid2') {
      const el = h(`<div class="${cls}"></div>`);
      Object.values(fields).forEach((f) => el.appendChild(f.el));
      return { el, get: () => Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.get()])) };
    },
  };

  const LAYOUTS = [[4, 'กึ่งกลาง (รูปบน ข้อความล่าง)'], [2, 'รูปซ้าย ข้อความขวา'], [3, 'ข้อความซ้าย รูปขวา'], [1, 'แถบสีกรมท่า รูปซ้าย']];
  function blockEditor(b, folder) {
    const layout = F.select('รูปแบบการจัดวาง', b.layout || 4, LAYOUTS);
    const title = F.text('หัวข้อ', b.title);
    const img = F.file('รูปภาพ', b.image, { folder });
    const html = F.html('เนื้อหา', b.html);
    const el = h('<div style="display:grid;gap:10px"></div>');
    const top = h('<div class="grid2"></div>'); top.append(layout.el, title.el);
    el.append(top, img.el, html.el);
    return { el, get: () => ({ layout: +layout.get(), title: title.get(), image: img.get(), html: html.get() }) };
  }

  // ---------------- views ----------------
  const view = () => $('#view');
  function crumb(parts) {
    $('#crumb').innerHTML = parts.map((p, i) => (i < parts.length - 1 && p[1] ? `<a data-go="${p[1]}">${esc(p[0])}</a>` : esc(p[0]))).join(' / ');
    $$('#crumb a').forEach((a) => (a.onclick = () => go(a.dataset.go)));
  }
  function go(tab) {
    state.tab = tab;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    ({ products: listProducts, blogs: listBlogs, categories: listCategories, banners: editBanners, settings: editSettings, pages: editPages })[tab]();
    window.scrollTo(0, 0);
  }

  function formShell(title, fields, onSave, onDelete) {
    const form = h(`<form class="form"><h2>${esc(title)}</h2></form>`);
    fields.forEach((f) => form.appendChild(f.el || f));
    const actions = h(`<div class="form-actions"><div>${onDelete ? '<button type="button" class="btn danger del">ลบรายการนี้</button>' : ''}</div><div style="display:flex;gap:8px"><button type="button" class="btn cancel">ยกเลิก</button><button type="submit" class="btn primary">บันทึก</button></div></div>`);
    form.appendChild(actions);
    form.onsubmit = (e) => { e.preventDefault(); try { onSave(); } catch (err) { toast(err.message, 'err'); } };
    $('.cancel', form).onclick = () => go(state.tab);
    if (onDelete) $('.del', form).onclick = () => { if (confirm('ยืนยันการลบ? (ลบจริงเมื่อกดเผยแพร่)')) onDelete(); };
    view().innerHTML = ''; view().appendChild(form);
  }

  // ----- products -----
  function listProducts() {
    crumb([['สินค้า']]);
    const d = state.data;
    const cats = d.categories;
    view().innerHTML = `
      <div class="toolbar">
        <button class="btn primary" id="add">+ เพิ่มสินค้า</button>
        <input id="q" placeholder="ค้นหาชื่อสินค้า…">
        <select id="cat"><option value="">ทุกหมวด</option>${cats.map((c) => `<option value="${esc(c.slug)}">${esc(c.title)}</option>`).join('')}</select>
      </div>
      <table><thead><tr><th></th><th>ชื่อสินค้า</th><th class="hide-sm">หมวด</th><th>สถานะ</th><th class="hide-sm">ลำดับ</th></tr></thead><tbody id="rows"></tbody></table>
      <p class="hint">รุ่นย่อย (เช่น SOLACE 210 ใต้ Oxyhealth Series) จะแสดงเยื้องอยู่ใต้สินค้าหลัก และแสดงเป็นปุ่มในหน้าสินค้าหลัก</p>`;
    const paint = () => {
      const q = $('#q').value.toLowerCase(), cat = $('#cat').value;
      const top = d.products.filter((p) => !p.parent).sort((a, b) => a.order - b.order);
      const rows = [];
      top.forEach((p) => { rows.push([p, false]); d.products.filter((c) => c.parent === p.id).sort((a, b) => a.order - b.order).forEach((c) => rows.push([c, true])); });
      d.products.filter((p) => p.parent && !d.products.some((x) => x.id === p.parent)).forEach((p) => rows.push([p, false]));
      $('#rows').innerHTML = rows.filter(([p]) => (!q || p.title.toLowerCase().includes(q)) && (!cat || p.categories.includes(cat))).map(([p, child]) => `
        <tr class="row ${child ? 'child' : ''}" data-id="${p.id}">
          <td><img class="th" src="${esc(src(p.cover))}" alt="" loading="lazy"></td>
          <td>${child ? '↳ ' : ''}<b>${esc(p.title)}</b><div class="hint">${esc(p.subtitle)}</div></td>
          <td class="hide-sm">${p.categories.map((c) => `<span class="tag">${esc(d.categories.find((x) => x.slug === c)?.title || c)}</span>`).join('')}</td>
          <td>${p.active === false ? '<span class="tag off">ซ่อน</span>' : '<span class="tag">แสดง</span>'}${p.featured ? '<span class="tag star">แนะนำ</span>' : ''}</td>
          <td class="hide-sm">${p.order}</td>
        </tr>`).join('');
      $$('#rows tr').forEach((tr) => (tr.onclick = () => editProduct(+tr.dataset.id)));
    };
    $('#q').oninput = paint; $('#cat').onchange = paint;
    $('#add').onclick = () => editProduct(null);
    paint();
  }

  function editProduct(id) {
    const d = state.data;
    const isNew = id === null;
    const p = isNew ? { id: Math.max(0, ...d.products.map((x) => x.id)) + 1, slug: '', title: '', subtitle: '', parent: 0, categories: [], featured: false, active: true, order: d.products.length, cover: '', catalog: '', youtube: '', about_html: '', gallery: [], blocks: [], related_blogs: [], meta_title: '', meta_description: '', meta_keywords: '' } : clone(d.products.find((x) => x.id === id));
    crumb([['สินค้า', 'products'], [isNew ? 'เพิ่มสินค้าใหม่' : p.title]]);
    const f = {
      title: F.text('ชื่อสินค้า *', p.title),
      slug: F.text('Slug (ส่วนท้าย URL)', p.slug, { hint: 'ภาษาอังกฤษ ตัวเล็ก ใช้ - แทนช่องว่าง เว้นว่างเพื่อสร้างจากชื่อ' }),
      subtitle: F.text('คำอธิบายสั้น', p.subtitle),
      parent: F.select('เป็นรุ่นย่อยของ', p.parent || 0, [[0, '— ไม่ใช่ (สินค้าหลัก) —'], ...d.products.filter((x) => !x.parent && x.id !== p.id).map((x) => [x.id, x.title])]),
    };
    const cats = F.checks('หมวดสินค้า', p.categories, d.categories.map((c) => [c.slug, c.title]));
    const flags = F.group({ order: F.num('ลำดับการแสดง (น้อย = ก่อน)', p.order), featured: F.check('แสดงในส่วน Featured Products หน้าแรก', p.featured), active: F.check('แสดงบนเว็บ', p.active !== false) }, 'grid3');
    const media = F.group({ cover: F.file('รูปหน้าปก (การ์ดสินค้า)', p.cover), catalog: F.file('แคตตาล็อก PDF', p.catalog, { folder: 'storage', accept: 'application/pdf', kind: 'pdf' }) });
    const yt = F.text('YouTube (ลิงก์หรือรหัสวิดีโอ)', p.youtube, { placeholder: 'https://youtu.be/xxxxxxxxxxx' });
    const about = F.html('About Product', p.about_html);
    const gallery = F.gallery('รูปสไลด์ด้านบนของหน้าสินค้า', p.gallery);
    const blocks = F.list('ส่วนเนื้อหาเพิ่มเติม', p.blocks, (b) => blockEditor(b, 'products'), { layout: 4, title: '', image: '', html: '' }, '+ เพิ่มส่วนเนื้อหา');
    const rel = F.checks('บทความที่เกี่ยวข้อง', p.related_blogs, d.blogs.filter((b) => b.type === 'blog').map((b) => [b.slug, b.title]));
    const seo = F.group({ meta_title: F.text('SEO title', p.meta_title), meta_keywords: F.text('SEO keywords', p.meta_keywords), meta_description: F.area('SEO description', p.meta_description) });
    formShell(isNew ? 'เพิ่มสินค้าใหม่' : `แก้ไข: ${p.title}`, [F.group({ a: f.title, b: f.slug }), F.group({ a: f.subtitle, b: f.parent }), cats, flags, media, yt, about, gallery, blocks, rel, h('<h3>SEO</h3>'), seo], () => {
      const title = f.title.get(); if (!title) throw new Error('กรุณาใส่ชื่อสินค้า');
      const slug = f.slug.get() || slugify(title);
      if (d.products.some((x) => x.slug === slug && x.id !== p.id)) throw new Error('Slug นี้ถูกใช้แล้ว');
      const oldSlug = p.slug;
      Object.assign(p, { title, slug, subtitle: f.subtitle.get(), parent: +f.parent.get(), categories: cats.get(), ...flags.get(), ...media.get(), youtube: yt.get(), about_html: about.get(), gallery: gallery.get(), blocks: blocks.get(), related_blogs: rel.get(), ...seo.get() });
      if (isNew) d.products.push(p); else d.products[d.products.findIndex((x) => x.id === p.id)] = p;
      if (oldSlug && oldSlug !== slug) relinkProduct(oldSlug, slug);
      markDirty('products'); toast('บันทึกแล้ว (กด "เผยแพร่" เพื่อขึ้นเว็บ)'); go('products');
    }, isNew ? null : () => {
      if (d.products.some((x) => x.parent === p.id)) { toast('ลบไม่ได้: ยังมีรุ่นย่อยอยู่ใต้สินค้านี้', 'err'); return; }
      d.products = d.products.filter((x) => x.id !== p.id); markDirty('products'); go('products');
    });
  }

  function relinkProduct(oldSlug, slug) {
    const fix = (l) => (l === `product.html?slug=${oldSlug}` ? `product.html?slug=${slug}` : l);
    ['hero', 'hero_mobile'].forEach((k) => (state.data.banners[k] || []).forEach((b) => { const n = fix(b.link); if (n !== b.link) { b.link = n; markDirty('banners'); } }));
  }

  // ----- blogs -----
  function listBlogs() {
    crumb([['บทความ / รีวิว']]);
    const d = state.data;
    view().innerHTML = `
      <div class="toolbar">
        <button class="btn primary" id="add">+ เพิ่มบทความ</button>
        <input id="q" placeholder="ค้นหา…">
        <select id="type"><option value="">ทั้งหมด</option><option value="blog">บทความ (Blogs)</option><option value="review">รีวิวนักกีฬา (Product reviews)</option></select>
      </div>
      <table><thead><tr><th></th><th>หัวข้อ</th><th class="hide-sm">ประเภท</th><th>สถานะ</th></tr></thead><tbody id="rows"></tbody></table>`;
    const paint = () => {
      const q = $('#q').value.toLowerCase(), t = $('#type').value;
      $('#rows').innerHTML = [...d.blogs].sort((a, b) => b.id - a.id).filter((b) => (!q || b.title.toLowerCase().includes(q)) && (!t || b.type === t)).map((b) => `
        <tr class="row" data-id="${b.id}"><td><img class="th" src="${esc(src(b.cover))}" alt="" loading="lazy" style="object-fit:cover"></td>
        <td><b>${esc(b.title)}</b><div class="hint">${esc(b.subtitle)}</div></td>
        <td class="hide-sm"><span class="tag">${b.type === 'review' ? 'รีวิว' : 'บทความ'}</span></td>
        <td>${b.active === false ? '<span class="tag off">ซ่อน</span>' : '<span class="tag">แสดง</span>'}${b.featured ? '<span class="tag star">สไลด์</span>' : ''}</td></tr>`).join('');
      $$('#rows tr').forEach((tr) => (tr.onclick = () => editBlog(+tr.dataset.id)));
    };
    $('#q').oninput = paint; $('#type').onchange = paint; $('#add').onclick = () => editBlog(null);
    paint();
  }

  function editBlog(id) {
    const d = state.data;
    const isNew = id === null;
    const b = isNew ? { id: Math.max(0, ...d.blogs.map((x) => x.id)) + 1, slug: '', title: '', subtitle: '', type: 'blog', featured: false, active: true, order: 0, cover: '', blocks: [], meta_title: '', meta_description: '' } : clone(d.blogs.find((x) => x.id === id));
    crumb([['บทความ', 'blogs'], [isNew ? 'เพิ่มบทความใหม่' : b.title]]);
    const title = F.text('หัวข้อ *', b.title), slug = F.text('Slug', b.slug, { hint: 'เว้นว่างเพื่อสร้างจากหัวข้อ' });
    const subtitle = F.text('บรรทัดรอง (เช่น วันที่ | ผู้เขียน หรือ ชนิดกีฬา)', b.subtitle);
    const type = F.select('ประเภท', b.type, [['blog', 'บทความ (Blogs)'], ['review', 'รีวิวนักกีฬา (Product reviews)']]);
    const flags = F.group({ featured: F.check('แสดงในสไลด์ใหญ่หน้า Blog', b.featured), active: F.check('แสดงบนเว็บ', b.active !== false), order: F.num('ลำดับ', b.order) }, 'grid3');
    const cover = F.file('รูปหน้าปก', b.cover, { folder: 'blog' });
    const blocks = F.list('เนื้อหา', b.blocks, (x) => blockEditor(x, 'blog'), { layout: 3, title: '', image: '', html: '' }, '+ เพิ่มย่อหน้า/ส่วนเนื้อหา');
    const seo = F.group({ meta_title: F.text('SEO title', b.meta_title), meta_description: F.area('SEO description', b.meta_description) });
    formShell(isNew ? 'เพิ่มบทความใหม่' : `แก้ไข: ${b.title}`, [F.group({ a: title, b: slug }), F.group({ a: subtitle, b: type }), flags, cover, blocks, h('<h3>SEO</h3>'), seo], () => {
      const t = title.get(); if (!t) throw new Error('กรุณาใส่หัวข้อ');
      const s = slug.get() || slugify(t);
      if (d.blogs.some((x) => x.slug === s && x.id !== b.id)) throw new Error('Slug นี้ถูกใช้แล้ว');
      const old = b.slug;
      Object.assign(b, { title: t, slug: s, subtitle: subtitle.get(), type: type.get(), ...flags.get(), cover: cover.get(), blocks: blocks.get(), ...seo.get() });
      if (isNew) d.blogs.push(b); else d.blogs[d.blogs.findIndex((x) => x.id === b.id)] = b;
      if (old && old !== s) d.products.forEach((p) => { const i = p.related_blogs.indexOf(old); if (i >= 0) { p.related_blogs[i] = s; markDirty('products'); } });
      markDirty('blogs'); toast('บันทึกแล้ว (กด "เผยแพร่" เพื่อขึ้นเว็บ)'); go('blogs');
    }, isNew ? null : () => {
      d.blogs = d.blogs.filter((x) => x.id !== b.id);
      d.products.forEach((p) => { if (p.related_blogs.includes(b.slug)) { p.related_blogs = p.related_blogs.filter((s) => s !== b.slug); markDirty('products'); } });
      markDirty('blogs'); go('blogs');
    });
  }

  // ----- categories -----
  function listCategories() {
    crumb([['หมวดสินค้า']]);
    const d = state.data;
    view().innerHTML = `<div class="toolbar"><button class="btn primary" id="add">+ เพิ่มหมวด</button></div>
      <table><thead><tr><th></th><th>หมวด</th><th class="hide-sm">จำนวนสินค้า</th><th>สถานะ</th><th class="hide-sm">ลำดับ</th></tr></thead><tbody>
      ${[...d.categories].sort((a, b) => a.order - b.order).map((c) => `<tr class="row" data-id="${c.id}"><td><img class="th" src="${esc(src(c.image))}" alt="" style="object-fit:cover"></td><td><b>${esc(c.title)}</b><div class="hint">${esc(c.description)}</div></td><td class="hide-sm">${d.products.filter((p) => !p.parent && p.categories.includes(c.slug)).length}</td><td>${c.active === false ? '<span class="tag off">ซ่อน</span>' : '<span class="tag">แสดง</span>'}</td><td class="hide-sm">${c.order}</td></tr>`).join('')}
      </tbody></table><p class="hint">หมวดที่ "แสดง" จะเป็นภาพแถวหมวดสินค้าในหน้าแรก ปุ่มกรองในหน้า Products และลิงก์ใน footer</p>`;
    $$('tr.row').forEach((tr) => (tr.onclick = () => editCategory(+tr.dataset.id)));
    $('#add').onclick = () => editCategory(null);
  }

  function editCategory(id) {
    const d = state.data;
    const isNew = id === null;
    const c = isNew ? { id: Math.max(0, ...d.categories.map((x) => x.id)) + 1, slug: '', title: '', description: '', image: '', order: d.categories.length, active: true } : clone(d.categories.find((x) => x.id === id));
    crumb([['หมวดสินค้า', 'categories'], [isNew ? 'เพิ่มหมวด' : c.title]]);
    const title = F.text('ชื่อหมวด *', c.title), slug = F.text('Slug', c.slug), desc = F.area('คำอธิบาย', c.description);
    const img = F.file('รูปภาพ (แนวตั้ง/สี่เหลี่ยม)', c.image, { folder: 'products' });
    const flags = F.group({ order: F.num('ลำดับ', c.order), active: F.check('แสดงบนเว็บ', c.active !== false) });
    formShell(isNew ? 'เพิ่มหมวด' : `แก้ไข: ${c.title}`, [F.group({ a: title, b: slug }), desc, img, flags], () => {
      const t = title.get(); if (!t) throw new Error('กรุณาใส่ชื่อหมวด');
      const s = slug.get() || slugify(t);
      if (d.categories.some((x) => x.slug === s && x.id !== c.id)) throw new Error('Slug นี้ถูกใช้แล้ว');
      const old = c.slug;
      Object.assign(c, { title: t, slug: s, description: desc.get(), image: img.get(), ...flags.get() });
      if (isNew) d.categories.push(c); else d.categories[d.categories.findIndex((x) => x.id === c.id)] = c;
      if (old && old !== s) d.products.forEach((p) => { const i = p.categories.indexOf(old); if (i >= 0) { p.categories[i] = s; markDirty('products'); } });
      markDirty('categories'); go('categories');
    }, isNew ? null : () => {
      if (d.products.some((p) => p.categories.includes(c.slug))) { toast('ลบไม่ได้: ยังมีสินค้าอยู่ในหมวดนี้ (ซ่อนแทนได้)', 'err'); return; }
      d.categories = d.categories.filter((x) => x.id !== c.id); markDirty('categories'); go('categories');
    });
  }

  // ----- banners -----
  function editBanners() {
    crumb([['แบนเนอร์ & พาร์ทเนอร์']]);
    const bn = state.data.banners;
    const slide = (x) => {
      const img = F.file('รูป (แนะนำ 1920×600)', x.image, { folder: 'banner' });
      const g = F.group({ title: F.text('หัวข้อ', x.title), subtitle: F.text('ข้อความรอง', x.subtitle) });
      const link = F.text('ลิงก์ปุ่ม Read More', x.link, { placeholder: 'product.html?slug=sintesi' });
      const el = h('<div style="display:grid;gap:10px"></div>'); el.append(img.el, g.el, link.el);
      return { el, get: () => ({ image: img.get(), ...g.get(), link: link.get() }) };
    };
    const blank = { image: '', title: '', subtitle: '', link: '' };
    const hero = F.list('สไลด์หน้าแรก (คอมพิวเตอร์)', bn.hero, slide, blank, '+ เพิ่มสไลด์');
    const mob = F.list('สไลด์หน้าแรก (มือถือ)', bn.hero_mobile, slide, blank, '+ เพิ่มสไลด์');
    const partners = F.gallery('โลโก้พาร์ทเนอร์ (แถบเลื่อน Our Partners)', bn.partners, 'banner');
    formShell('แบนเนอร์ & พาร์ทเนอร์', [hero, mob, h('<h3>Our Partners</h3>'), partners], () => {
      state.data.banners = { hero: hero.get(), hero_mobile: mob.get(), partners: partners.get() };
      markDirty('banners'); toast('บันทึกแล้ว (กด "เผยแพร่" เพื่อขึ้นเว็บ)');
    });
  }

  // ----- settings -----
  function editSettings() {
    crumb([['ข้อมูลบริษัท']]);
    const s = state.data.settings;
    const co = F.group({
      company_name: F.text('ชื่อบริษัท (สั้น)', s.company_name), company_name_long: F.text('ชื่อบริษัท (ที่อยู่)', s.company_name_long),
      address: F.text('ที่อยู่', s.address), tax_id: F.text('เลขประจำตัวผู้เสียภาษี', s.tax_id),
      phone: F.text('โทรศัพท์', s.phone), fax: F.text('แฟกซ์', s.fax), email: F.text('อีเมล', s.email), hours: F.text('เวลาทำการ', s.hours),
    });
    const map = F.group({ google_map: F.text('ลิงก์ Google Maps', s.google_map), google_map_embed: F.text('Google Maps embed URL', s.google_map_embed, { hint: 'Google Maps → แชร์ → ฝังแผนที่ → คัดลอกค่า src' }) });
    const misc = F.group({ youtube_intro: F.text('วิดีโอ YouTube ส่วน About Us', s.youtube_intro), contact_form_endpoint: F.text('URL ของ Google Apps Script (ฟอร์มติดต่อ)', s.contact_form_endpoint, { hint: 'ถ้าเว้นว่าง ปุ่ม Send จะเปิดแอปอีเมลของผู้ใช้แทน' }) });
    const catalog = F.file('แคตตาล็อกรวม (ปุ่ม Download Catalog หน้าแรก)', s.catalog_pdf, { folder: 'storage', accept: 'application/pdf', kind: 'pdf' });
    const socials = F.list('โซเชียลมีเดีย', s.socials, (x) => {
      const g = F.group({ name: F.text('ชื่อ', x.name), url: F.text('ลิงก์', x.url) });
      const icon = F.file('ไอคอน', x.icon, { folder: 'socials' });
      const el = h('<div style="display:grid;gap:10px"></div>'); el.append(g.el, icon.el);
      return { el, get: () => ({ ...g.get(), icon: icon.get() }) };
    }, { name: '', url: '', icon: '' }, '+ เพิ่มโซเชียล');
    const seo = F.group({ site_name: F.text('ชื่อเว็บไซต์', s.site_name), meta_title: F.text('SEO title หน้าแรก', s.meta_title), meta_keywords: F.text('SEO keywords', s.meta_keywords), meta_description: F.area('SEO description', s.meta_description) });
    const terms = F.html('Terms & Conditions', s.legal?.terms), privacy = F.html('Privacy Policy', s.legal?.privacy);
    formShell('ข้อมูลบริษัท', [co, map, misc, catalog, socials, h('<h3>SEO</h3>'), seo, h('<h3>หน้ากฎหมาย</h3>'), h('<p class="hint">ใช้ {{company}}, {{email}}, {{phone}} แทนค่าจากข้อมูลบริษัทได้</p>'), terms, privacy], () => {
      Object.assign(s, co.get(), map.get(), misc.get(), { catalog_pdf: catalog.get(), socials: socials.get() }, seo.get());
      s.legal = { terms: terms.get(), privacy: privacy.get() };
      markDirty('settings'); toast('บันทึกแล้ว (กด "เผยแพร่" เพื่อขึ้นเว็บ)');
    });
  }

  // ----- page texts -----
  const PAGE_NAMES = { home: 'หน้าแรก', products: 'หน้า Products', blog: 'หน้า Blog', 'contact-us': 'หน้า Contact' };
  const BLOCK_NAMES = { BannersTop1: 'หัวแบนเนอร์', BreadcrumbList1: 'Breadcrumb', BreadcrumbList2: 'หัวข้อรายการ', ContentsContent4: 'ส่วน About Us', OurclientsLists2: 'ส่วน Our Partners', ProductsFeature1: 'ส่วน Featured Products', ContactContent1: 'แถบ Contact', ContactContent2: 'หัวข้อหน้า Contact' };
  function editPages() {
    crumb([['ข้อความหน้าเว็บ']]);
    const pages = state.data.settings.pages || {};
    const getters = [];
    const els = [];
    for (const [slug, pg] of Object.entries(pages)) {
      els.push(h(`<h3>${esc(PAGE_NAMES[slug] || slug)}</h3>`));
      for (const [comp, fields] of Object.entries(pg.blocks || {})) {
        const keys = Object.keys(fields).filter((k) => !/^Banner/.test(k) && k !== 'link' && (typeof fields[k] === 'string' || typeof fields[k] === 'number'));
        if (!keys.length) continue;
        const box = h(`<div class="block"><b>${esc(BLOCK_NAMES[comp] || comp)}</b></div>`);
        for (const k of keys) {
          const f = k === 'description' ? F.html(k, fields[k]) : F.text(k, String(fields[k] ?? ''), { hint: /<br/i.test(fields[k]) ? 'ใช้ <br> เพื่อขึ้นบรรทัดใหม่' : '' });
          box.appendChild(f.el);
          getters.push(() => { fields[k] = typeof fields[k] === 'number' ? Number(f.get()) : f.get(); });
        }
        els.push(box);
      }
    }
    formShell('ข้อความหน้าเว็บ', els, () => { getters.forEach((g) => g()); markDirty('settings'); toast('บันทึกแล้ว (กด "เผยแพร่" เพื่อขึ้นเว็บ)'); });
  }

  // ---------------- boot ----------------
  async function start() {
    $('#login').classList.add('hidden');
    $('#shell').classList.remove('hidden');
    view().innerHTML = '<p class="muted">กำลังโหลดข้อมูล…</p>';
    $('#who').textContent = state.preview ? 'โหมดดูอย่างเดียว' : `${state.cfg.owner}/${state.cfg.repo} @ ${state.cfg.branch}`;
    try {
      state.data = await loadData();
      go(state.tab);
      updateDirty();
    } catch (e) {
      console.error(e);
      $('#shell').classList.add('hidden'); $('#login').classList.remove('hidden');
      const err = $('#loginErr'); err.textContent = 'เชื่อมต่อไม่สำเร็จ: ' + e.message; err.classList.remove('hidden');
    }
  }

  function init() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { /* storage blocked */ }
    const form = $('#loginForm');
    if (saved) ['owner', 'repo', 'branch', 'prefix', 'token'].forEach((k) => { if (saved[k] != null) form[k].value = saved[k]; });
    form.onsubmit = (e) => {
      e.preventDefault();
      state.cfg = { owner: form.owner.value.trim(), repo: form.repo.value.trim(), branch: form.branch.value.trim() || 'main', prefix: form.prefix.value.trim(), token: form.token.value.trim() };
      try { if (form.remember.checked) localStorage.setItem(LS_KEY, JSON.stringify(state.cfg)); else localStorage.removeItem(LS_KEY); } catch (err) { /* ignore */ }
      state.preview = false; start();
    };
    $('#previewBtn').onclick = () => { state.preview = true; state.cfg = null; start(); };
    $('#logout').onclick = () => {
      if (state.dirty.size && !confirm('ยังมีการแก้ไขที่ไม่ได้เผยแพร่ ออกจากระบบเลยหรือไม่?')) return;
      try { const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (s) { delete s.token; localStorage.setItem(LS_KEY, JSON.stringify(s)); } } catch (e) { /* ignore */ }
      state.dirty.clear(); location.reload();
    };
    $$('#tabs button').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
    $('#publishBtn').onclick = publish;
    $('#exportBtn').onclick = exportJson;
    if (saved?.token) { state.cfg = saved; start(); } else $('#login').classList.remove('hidden');
  }
  init();
})();
