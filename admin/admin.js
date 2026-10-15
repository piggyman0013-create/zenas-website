/* Zenas admin — edits the site's data/*.json and media, then commits everything to GitHub in one commit. */
(function () {
  'use strict';
  const SITE_FILES = ['settings', 'banners', 'categories', 'products', 'blogs'];
  const FILES = [...SITE_FILES, 'templates'];
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
      if (n === 'templates') {
        try {
          out[n] = state.preview ? await (await fetch(`../data/templates.json?t=${Date.now()}`)).json()
            : JSON.parse(await gh('GET', `/contents/${encodeURI(repoPath('data/templates.json'))}?ref=${encodeURIComponent(state.cfg.branch)}`, null, 'application/vnd.github.raw+json'));
        } catch (e) { out[n] = { sections: [], pages: [], defaults: {} }; }
        return;
      }
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
    if ([...state.dirty].some((n) => SITE_FILES.includes(n))) files.push({ path: repoPath('data/bundle.js'), content: 'window.ZENAS_DATA=' + JSON.stringify(Object.fromEntries(SITE_FILES.map((n) => [n, state.data[n]]))) + ';\n', encoding: 'utf-8' });
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
        if (kind === 'pdf') { pv.classList.add('pdf'); pv.innerHTML = cur ? `<a href="${esc(src(cur))}" target="_blank">เปิดไฟล์</a>` : 'ไม่มีไฟล์'; }
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

  // ---------------- content sections + templates ----------------
  const BTYPES = {
    media: 'รูป + ข้อความ', text: 'ข้อความล้วน', features: 'จุดเด่น (การ์ด)', specs: 'ตารางสเปก', gallery: 'แกลเลอรีรูป',
    video: 'วิดีโอ YouTube', cta: 'ปุ่มติดต่อ / CTA', quote: 'คำรับรอง / รีวิว', downloads: 'เอกสารดาวน์โหลด',
  };
  const BLANK = {
    media: { type: 'media', layout: 2, bg: 'white', title: '', image: '', html: '' },
    text: { type: 'text', align: 'left', bg: 'white', title: '', html: '' },
    features: { type: 'features', columns: 3, bg: 'light', title: '', html: '', items: [{ image: '', title: '', text: '' }, { image: '', title: '', text: '' }, { image: '', title: '', text: '' }] },
    specs: { type: 'specs', bg: 'white', title: 'Specifications', html: '', rows: [{ label: '', value: '' }] },
    gallery: { type: 'gallery', columns: 3, bg: 'white', title: '', html: '', images: [] },
    video: { type: 'video', bg: 'light', title: '', youtube: '', html: '' },
    cta: { type: 'cta', bg: 'white', title: '', html: '', button: 'Contact us', link: 'contact.html', button2: '', link2: '' },
    quote: { type: 'quote', bg: 'light', image: '', html: '', author: '', role: '' },
    downloads: { type: 'downloads', bg: 'white', title: 'Downloads', html: '', files: [{ label: '', file: '' }] },
  };
  const LAYOUTS = [[2, 'รูปซ้าย ข้อความขวา'], [3, 'ข้อความซ้าย รูปขวา'], [4, 'รูปใหญ่กึ่งกลาง ข้อความล่าง'], [1, 'แถบสีกรมท่า รูปซ้าย']];
  const BGS = [['white', 'พื้นขาว'], ['light', 'พื้นฟ้าอ่อน'], ['navy', 'พื้นกรมท่า (ตัวอักษรขาว)']];
  const typeOf = (b) => (BTYPES[b?.type] ? b.type : 'media');
  const norm = (b) => ({ ...clone(BLANK[typeOf(b)]), ...clone(b || {}), type: typeOf(b) });

  /** replace {{title}} etc. in every string of a block */
  function fillVars(obj, vars) {
    if (typeof obj === 'string') return obj.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] != null && vars[k] !== '' ? vars[k] : m));
    if (Array.isArray(obj)) return obj.map((x) => fillVars(x, vars));
    if (obj && typeof obj === 'object') return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fillVars(v, vars)]));
    return obj;
  }

  /** tiny schematic of a section, used on template cards */
  function thumb(b) {
    const t = typeOf(b), L = +b.layout || 2, bg = t === 'media' && L === 1 ? 'navy' : b.bg || 'white';
    const fill = { white: '#ffffff', light: '#eaf2f8', navy: '#1c1c3c' }[bg] || '#fff';
    const ink = bg === 'navy' ? '#c9d2ff' : '#9aa6c4', img = '#bcd3f5', acc = '#3f7fe0';
    const lines = (x, y, w, n = 3) => Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * 7}" width="${i === n - 1 ? w * 0.6 : w}" height="3" rx="1.5" fill="${ink}"/>`).join('');
    const ttl = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="${bg === 'navy' ? '#fff' : '#5b6684'}"/>`;
    let g = '';
    if (t === 'media') {
      if (L === 4) g = `<rect x="35" y="8" width="50" height="32" rx="3" fill="${img}"/>${ttl(40, 46, 40)}${lines(30, 56, 60, 2)}`;
      else { const ix = L === 3 ? 66 : 10, tx = L === 3 ? 10 : 66; g = `<rect x="${ix}" y="12" width="44" height="48" rx="3" fill="${img}"/>${ttl(tx, 20, 38)}${lines(tx, 32, 44)}`; }
    } else if (t === 'text') g = `${ttl(14, 14, 50)}${lines(14, 26, 92, 5)}`;
    else if (t === 'features') g = `${ttl(38, 8, 44)}` + [0, 1, 2].map((i) => `<circle cx="${22 + i * 38}" cy="32" r="8" fill="${acc}"/><rect x="${10 + i * 38}" y="46" width="24" height="3" rx="1.5" fill="${ink}"/><rect x="${12 + i * 38}" y="53" width="20" height="3" rx="1.5" fill="${ink}"/>`).join('');
    else if (t === 'specs') g = `${ttl(14, 8, 50)}` + [0, 1, 2, 3, 4].map((i) => `<rect x="14" y="${20 + i * 10}" width="34" height="3" rx="1.5" fill="${ink}"/><rect x="56" y="${20 + i * 10}" width="50" height="3" rx="1.5" fill="${ink}"/><line x1="14" x2="106" y1="${25 + i * 10}" y2="${25 + i * 10}" stroke="#dde3ee"/>`).join('');
    else if (t === 'gallery') g = [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${12 + (i % 3) * 33}" y="${10 + Math.floor(i / 3) * 27}" width="29" height="23" rx="3" fill="${img}"/>`).join('');
    else if (t === 'video') g = `<rect x="22" y="8" width="76" height="46" rx="4" fill="#111827"/><polygon points="54,22 54,40 70,31" fill="#ef4444"/>${lines(36, 60, 48, 1)}`;
    else if (t === 'cta') g = `<rect x="8" y="18" width="104" height="36" rx="6" fill="url(#gr)"/><rect x="16" y="28" width="46" height="5" rx="2" fill="#fff"/><rect x="16" y="38" width="34" height="3" rx="1.5" fill="#e0ecff"/><rect x="78" y="30" width="26" height="11" rx="5.5" fill="#fff"/>`;
    else if (t === 'quote') g = `<circle cx="30" cy="34" r="16" fill="${img}"/><rect x="54" y="20" width="3" height="28" fill="${acc}"/>${lines(62, 22, 46, 3)}<rect x="62" y="46" width="26" height="3" rx="1.5" fill="#5b6684"/>`;
    else if (t === 'downloads') g = `${ttl(14, 8, 44)}` + [0, 1, 2].map((i) => `<rect x="14" y="${20 + i * 15}" width="92" height="11" rx="3" fill="none" stroke="#c5cfe2"/><rect x="18" y="${23 + i * 15}" width="6" height="5" fill="${acc}"/><rect x="28" y="${24 + i * 15}" width="40" height="3" rx="1.5" fill="${ink}"/>`).join('');
    return `<svg viewBox="0 0 120 72" class="thumb"><defs><linearGradient id="gr"><stop offset="0" stop-color="#1c41b0"/><stop offset="1" stop-color="#3fb6f0"/></linearGradient></defs><rect width="120" height="72" rx="6" fill="${fill}" stroke="#e1e5ee"/>${g}</svg>`;
  }

  /** editor for one section; returns {el, get} */
  function blockEditor(raw, folder) {
    const b = norm(raw);
    const t = b.type;
    const el = h('<div style="display:grid;gap:10px"></div>');
    const parts = {};
    const add = (k, f) => { parts[k] = f; el.appendChild(f.el); return f; };
    const row = (fields) => { const g = F.group(fields); el.appendChild(g.el); Object.assign(parts, fields); };
    const bgField = F.select('พื้นหลังของส่วนนี้', b.bg || 'white', BGS);
    if (t === 'media') {
      row({ layout: F.select('การจัดวาง', b.layout || 2, LAYOUTS), bg: bgField });
      add('title', F.text('หัวข้อ', b.title)); add('image', F.file('รูปภาพ', b.image, { folder })); add('html', F.html('เนื้อหา', b.html));
    } else if (t === 'text') {
      row({ align: F.select('การจัดตำแหน่ง', b.align || 'left', [['left', 'ชิดซ้าย'], ['center', 'กึ่งกลาง']]), bg: bgField });
      add('title', F.text('หัวข้อ', b.title)); add('html', F.html('เนื้อหา', b.html));
    } else if (t === 'features') {
      row({ columns: F.select('จำนวนคอลัมน์', b.columns || 3, [[2, '2 คอลัมน์'], [3, '3 คอลัมน์'], [4, '4 คอลัมน์']]), bg: bgField });
      add('title', F.text('หัวข้อของส่วน', b.title)); add('html', F.html('คำนำ (ไม่ใส่ก็ได้)', b.html));
      add('items', F.list('การ์ดจุดเด่น', b.items, (x) => {
        const img = F.file('รูป/ไอคอน (ไม่ใส่ = จุดสีน้ำเงิน)', x.image, { folder }); const tt = F.text('หัวข้อ', x.title); const tx = F.area('คำอธิบายสั้น', x.text, { rows: 2 });
        const e = h('<div style="display:grid;gap:8px"></div>'); e.append(img.el, tt.el, tx.el);
        return { el: e, get: () => ({ image: img.get(), title: tt.get(), text: tx.get() }) };
      }, { image: '', title: '', text: '' }, '+ เพิ่มการ์ด'));
    } else if (t === 'specs') {
      add('bg', bgField); add('title', F.text('หัวข้อ', b.title)); add('html', F.html('คำอธิบาย (ไม่ใส่ก็ได้)', b.html));
      add('rows', F.list('แถวในตาราง', b.rows, (r) => F.group({ label: F.text('หัวข้อ', r.label), value: F.text('ค่า', r.value) }), { label: '', value: '' }, '+ เพิ่มแถว'));
    } else if (t === 'gallery') {
      row({ columns: F.select('จำนวนคอลัมน์', b.columns || 3, [[2, '2 คอลัมน์'], [3, '3 คอลัมน์'], [4, '4 คอลัมน์']]), bg: bgField });
      add('title', F.text('หัวข้อ', b.title)); add('html', F.html('คำอธิบาย (ไม่ใส่ก็ได้)', b.html)); add('images', F.gallery('รูปในแกลเลอรี', b.images, folder));
    } else if (t === 'video') {
      add('bg', bgField); add('title', F.text('หัวข้อ', b.title));
      add('youtube', F.text('YouTube (ลิงก์หรือรหัสวิดีโอ)', b.youtube, { placeholder: 'https://youtu.be/xxxxxxxxxxx' })); add('html', F.html('คำบรรยายใต้วิดีโอ', b.html));
    } else if (t === 'cta') {
      add('bg', bgField); add('title', F.text('หัวข้อ', b.title)); add('html', F.html('ข้อความ', b.html));
      row({ button: F.text('ปุ่มที่ 1 — ข้อความ', b.button), link: F.text('ปุ่มที่ 1 — ลิงก์', b.link, { hint: 'เช่น contact.html, tel:+6625190975, mailto:..., หรือลิงก์ PDF' }) });
      row({ button2: F.text('ปุ่มที่ 2 — ข้อความ (ไม่ใส่ก็ได้)', b.button2), link2: F.text('ปุ่มที่ 2 — ลิงก์', b.link2) });
    } else if (t === 'quote') {
      add('bg', bgField); add('image', F.file('รูปผู้ให้คำรับรอง (ไม่ใส่ก็ได้)', b.image, { folder })); add('html', F.html('คำพูด', b.html));
      row({ author: F.text('ชื่อ', b.author), role: F.text('ตำแหน่ง / องค์กร / กีฬา', b.role) });
    } else if (t === 'downloads') {
      add('bg', bgField); add('title', F.text('หัวข้อ', b.title)); add('html', F.html('คำอธิบาย (ไม่ใส่ก็ได้)', b.html));
      add('files', F.list('ไฟล์', b.files, (x) => F.group({ label: F.text('ชื่อที่แสดง', x.label), file: F.file('ไฟล์', x.file, { folder: 'storage', accept: '.pdf,.doc,.docx,.xls,.xlsx,.zip,application/pdf', kind: 'pdf' }) }), { label: '', file: '' }, '+ เพิ่มไฟล์'));
    }
    return {
      el,
      get: () => {
        const out = { type: t };
        for (const [k, f] of Object.entries(parts)) out[k] = f.get();
        ['layout', 'columns'].forEach((k) => { if (out[k] != null) out[k] = +out[k]; });
        if (t === 'media' && out.layout === 1) out.bg = 'navy';
        return out;
      },
    };
  }

  // ----- template helpers -----
  const T = () => state.data.templates || (state.data.templates = { sections: [], pages: [], defaults: {} });
  const sectionTpl = (id) => T().sections.find((s) => s.id === id);
  const pageBlocks = (tpl) => clone(tpl.blocks || (tpl.sections || []).map((id) => sectionTpl(id)?.block).filter(Boolean));
  const newId = (prefix) => `${prefix}-${Date.now().toString(36)}`;

  function modal(title, bodyEl, { wide = false } = {}) {
    const m = h(`<div class="modal"><div class="modal-card ${wide ? 'wide' : ''}"><div class="modal-head"><b>${esc(title)}</b><button type="button" class="btn sm close">ปิด</button></div><div class="modal-body"></div></div></div>`);
    $('.modal-body', m).appendChild(bodyEl);
    document.body.appendChild(m);
    const close = () => m.remove();
    $('.close', m).onclick = close;
    m.addEventListener('click', (e) => { if (e.target === m) close(); });
    return close;
  }

  /** choose a section template (or a blank section of any type) */
  function pickSection() {
    return new Promise((resolve) => {
      const body = h('<div></div>');
      body.appendChild(h('<h3 style="margin-top:0">ส่วนเนื้อหาสำเร็จรูป</h3>'));
      const grid = h('<div class="tpl-grid"></div>');
      T().sections.forEach((s) => grid.appendChild(h(`<button type="button" class="tpl-card" data-id="${esc(s.id)}">${thumb(s.block)}<b>${esc(s.name)}</b><span>${esc(s.description || BTYPES[typeOf(s.block)])}</span></button>`)));
      body.appendChild(grid);
      body.appendChild(h('<h3>เริ่มจากส่วนว่าง</h3>'));
      const g2 = h('<div class="tpl-grid small"></div>');
      Object.keys(BTYPES).forEach((k) => g2.appendChild(h(`<button type="button" class="tpl-card" data-blank="${k}">${thumb(BLANK[k])}<b>${esc(BTYPES[k])}</b></button>`)));
      body.appendChild(g2);
      let done = false;
      const close = modal('เลือกรูปแบบส่วนเนื้อหา', body, { wide: true });
      body.addEventListener('click', (e) => {
        const c = e.target.closest('.tpl-card'); if (!c) return;
        done = true; close();
        resolve(c.dataset.blank ? clone(BLANK[c.dataset.blank]) : clone(sectionTpl(c.dataset.id).block));
      });
      const obs = new MutationObserver(() => { if (!document.body.contains(body)) { obs.disconnect(); if (!done) resolve(null); } });
      obs.observe(document.body, { childList: true });
    });
  }

  /** choose a page template; resolves {blocks, mode:'append'|'replace'} or null */
  function pickPage(kind) {
    return new Promise((resolve) => {
      const list = T().pages.filter((p) => !p.for || p.for === kind || p.for === 'any');
      const body = h(`<div><p class="hint" style="margin-top:0">เลือกชุดส่วนเนื้อหาสำเร็จรูป แล้วแก้ข้อความ/รูปตามต้องการ</p>
        <label class="check" style="margin-bottom:12px"><input type="checkbox" class="rep"> แทนที่ส่วนเนื้อหาเดิมทั้งหมด (ถ้าไม่ติ๊ก จะเพิ่มต่อท้าย)</label></div>`);
      const grid = h('<div class="tpl-list"></div>');
      list.forEach((p) => {
        const blocks = pageBlocks(p);
        grid.appendChild(h(`<button type="button" class="tpl-row" data-id="${esc(p.id)}"><div class="strip">${blocks.slice(0, 6).map(thumb).join('')}</div><div><b>${esc(p.name)}</b><span>${esc(p.description || '')}</span><small>${blocks.length} ส่วน</small></div></button>`));
      });
      if (!list.length) grid.appendChild(h('<p class="hint">ยังไม่มีเทมเพลตทั้งหน้าสำหรับประเภทนี้</p>'));
      body.appendChild(grid);
      let done = false;
      const close = modal('ใช้เทมเพลตทั้งหน้า', body, { wide: true });
      grid.addEventListener('click', (e) => {
        const c = e.target.closest('.tpl-row'); if (!c) return;
        done = true; const mode = $('.rep', body).checked ? 'replace' : 'append'; close();
        resolve({ blocks: pageBlocks(T().pages.find((p) => p.id === c.dataset.id)), mode });
      });
      const obs = new MutationObserver(() => { if (!document.body.contains(body)) { obs.disconnect(); if (!done) resolve(null); } });
      obs.observe(document.body, { childList: true });
    });
  }

  function saveSectionAsTemplate(block) {
    const name = prompt('ตั้งชื่อเทมเพลตส่วนนี้', BTYPES[typeOf(block)] + ' (ของฉัน)');
    if (!name) return;
    T().sections.push({ id: newId('sec'), name: name.trim(), description: 'บันทึกจากหน้าแก้ไข', block: clone(block) });
    markDirty('templates'); toast('บันทึกเป็นเทมเพลตแล้ว — เลือกใช้ได้จากปุ่ม "+ เพิ่มส่วนเนื้อหา"');
  }

  /**
   * The section list used in product / blog / page-template editors.
   * opts: { folder, kind: 'product'|'blog', vars: () => ({title}) }
   */
  function blocksField(label, blocks, opts = {}) {
    const rows = [];
    const el = h(`<div class="sections"><div class="sections-head"><h3>${esc(label)}</h3><div class="acts">
        <button type="button" class="btn sm usepage">ใช้เทมเพลตทั้งหน้า</button>
        <button type="button" class="btn sm savepage">บันทึกทั้งหน้าเป็นเทมเพลต</button></div></div>
      <div class="rows" style="display:grid;gap:12px"></div>
      <button type="button" class="btn primary sm addsec" style="margin-top:12px">+ เพิ่มส่วนเนื้อหา (เลือกรูปแบบ)</button></div>`);
    const box = $('.rows', el);
    const renum = () => {
      box.innerHTML = '';
      if (!rows.length) box.appendChild(h('<p class="hint">ยังไม่มีส่วนเนื้อหา — กด "+ เพิ่มส่วนเนื้อหา" หรือ "ใช้เทมเพลตทั้งหน้า"</p>'));
      rows.forEach((r, i) => { $('.n', r.wrap).textContent = `#${i + 1} · ${BTYPES[r.type]}`; r.wrap.classList.toggle('off', !r.active); $('.vis', r.wrap).textContent = r.active ? 'ซ่อน' : 'แสดง'; box.appendChild(r.wrap); });
    };
    const add = (raw, at = rows.length, open = false) => {
      const b = norm(opts.vars ? fillVars(raw, opts.vars()) : raw);
      const ed = blockEditor(b, opts.folder);
      const wrap = h(`<div class="block sec"><div class="block-head"><button type="button" class="link-btn tog"><span class="caret">▸</span> <b class="n"></b> <span class="hint prev"></span></button>
        <div class="acts"><button type="button" class="btn sm up" title="เลื่อนขึ้น">▲</button><button type="button" class="btn sm dn" title="เลื่อนลง">▼</button>
        <button type="button" class="btn sm vis"></button><button type="button" class="btn sm dup">ทำซ้ำ</button><button type="button" class="btn sm tpl" title="บันทึกส่วนนี้เป็นเทมเพลต">☆ เทมเพลต</button>
        <button type="button" class="btn sm danger rm">ลบ</button></div></div><div class="sec-body"></div></div>`);
      $('.sec-body', wrap).appendChild(ed.el);
      const r = { wrap, ed, type: b.type, active: b.active !== false };
      const prev = () => { const g = ed.get(); $('.prev', wrap).textContent = (g.title || Zstrip(g.html) || g.author || '').slice(0, 60); };
      const setOpen = (o) => { wrap.classList.toggle('open', o); $('.caret', wrap).textContent = o ? '▾' : '▸'; if (!o) prev(); };
      $('.tog', wrap).onclick = () => setOpen(!wrap.classList.contains('open'));
      $('.up', wrap).onclick = () => { const i = rows.indexOf(r); if (i > 0) { rows.splice(i, 1); rows.splice(i - 1, 0, r); renum(); } };
      $('.dn', wrap).onclick = () => { const i = rows.indexOf(r); if (i < rows.length - 1) { rows.splice(i, 1); rows.splice(i + 1, 0, r); renum(); } };
      $('.vis', wrap).onclick = () => { r.active = !r.active; renum(); };
      $('.dup', wrap).onclick = () => add({ ...ed.get(), active: r.active }, rows.indexOf(r) + 1, true);
      $('.tpl', wrap).onclick = () => saveSectionAsTemplate(ed.get());
      $('.rm', wrap).onclick = () => { if (confirm('ลบส่วนนี้?')) { rows.splice(rows.indexOf(r), 1); renum(); } };
      rows.splice(at, 0, r); setOpen(open); renum();
      if (open) setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    };
    (blocks || []).forEach((b) => add(b));
    $('.addsec', el).onclick = async () => { const b = await pickSection(); if (b) add(b, rows.length, true); };
    $('.usepage', el).onclick = async () => {
      const r = await pickPage(opts.kind || 'product'); if (!r) return;
      if (r.mode === 'replace') { if (rows.length && !confirm('แทนที่ส่วนเนื้อหาเดิมทั้งหมด?')) return; rows.length = 0; }
      r.blocks.forEach((b) => add(b)); renum(); toast(`เพิ่ม ${r.blocks.length} ส่วนจากเทมเพลตแล้ว`);
    };
    $('.savepage', el).onclick = () => {
      if (!rows.length) { toast('ยังไม่มีส่วนเนื้อหาให้บันทึก', 'err'); return; }
      const name = prompt('ตั้งชื่อเทมเพลตทั้งหน้า'); if (!name) return;
      T().pages.push({ id: newId('page'), name: name.trim(), for: opts.kind || 'product', description: `${rows.length} ส่วน · บันทึกจากหน้าแก้ไข`, blocks: rows.map((r) => ({ ...r.ed.get(), active: r.active })) });
      markDirty('templates'); toast('บันทึกเทมเพลตทั้งหน้าแล้ว');
    };
    if (opts.hideTemplateButtons) { $('.usepage', el).remove(); $('.savepage', el).remove(); }
    return { el, get: () => rows.map((r) => ({ ...r.ed.get(), ...(r.active ? {} : { active: false }) })) };
  }
  const Zstrip = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').trim(); };

  // ----- Templates tab -----
  function listTemplates() {
    crumb([['เทมเพลตเนื้อหา']]);
    const t = T();
    const pageOpts = (kind) => [['', '— ไม่ใช้ (เริ่มจากหน้าว่าง) —'], ...t.pages.filter((p) => !p.for || p.for === kind || p.for === 'any').map((p) => [p.id, p.name])];
    view().innerHTML = '';
    const wrap = h(`<div>
      <div class="form" style="margin-bottom:18px"><h2>เทมเพลตเริ่มต้น</h2><p class="hint" style="margin:0">เมื่อกด "+ เพิ่มสินค้า" หรือ "+ เพิ่มบทความ" ระบบจะใส่ส่วนเนื้อหาจากเทมเพลตนี้ให้อัตโนมัติ คำว่า {{title}} ในเทมเพลตจะถูกแทนด้วยชื่อสินค้า/บทความ</p><div class="grid2 defs"></div></div>
      <div class="toolbar"><h2 style="margin:0;flex:1">เทมเพลตทั้งหน้า</h2><button class="btn primary sm" id="newPage">+ สร้างเทมเพลตทั้งหน้า</button></div>
      <table><thead><tr><th>ตัวอย่าง</th><th>ชื่อ</th><th class="hide-sm">ใช้กับ</th></tr></thead><tbody id="pages"></tbody></table>
      <div class="toolbar" style="margin-top:26px"><h2 style="margin:0;flex:1">ส่วนเนื้อหาสำเร็จรูป</h2><button class="btn primary sm" id="newSec">+ สร้างส่วนสำเร็จรูป</button></div>
      <table><thead><tr><th>ตัวอย่าง</th><th>ชื่อ</th><th class="hide-sm">ประเภท</th></tr></thead><tbody id="secs"></tbody></table></div>`);
    view().appendChild(wrap);
    const dP = F.select('สินค้าใหม่เริ่มจาก', t.defaults?.product || '', pageOpts('product'));
    const dB = F.select('บทความใหม่เริ่มจาก', t.defaults?.blog || '', pageOpts('blog'));
    $('.defs', wrap).append(dP.el, dB.el);
    const saveDefaults = () => { t.defaults = { product: dP.get(), blog: dB.get() }; markDirty('templates'); toast('บันทึกเทมเพลตเริ่มต้นแล้ว'); };
    $('select', dP.el).onchange = saveDefaults; $('select', dB.el).onchange = saveDefaults;
    const forName = { product: 'สินค้า', blog: 'บทความ', any: 'ทุกประเภท' };
    $('#pages', wrap).innerHTML = t.pages.map((p) => `<tr class="row" data-id="${esc(p.id)}"><td><div class="strip">${pageBlocks(p).slice(0, 5).map(thumb).join('')}</div></td><td><b>${esc(p.name)}</b><div class="hint">${esc(p.description || '')}</div></td><td class="hide-sm"><span class="tag">${forName[p.for] || 'ทุกประเภท'}</span></td></tr>`).join('') || '<tr><td colspan="3" class="hint">ยังไม่มี</td></tr>';
    $('#secs', wrap).innerHTML = t.sections.map((s) => `<tr class="row" data-id="${esc(s.id)}"><td>${thumb(s.block)}</td><td><b>${esc(s.name)}</b><div class="hint">${esc(s.description || '')}</div></td><td class="hide-sm"><span class="tag">${BTYPES[typeOf(s.block)]}</span></td></tr>`).join('') || '<tr><td colspan="3" class="hint">ยังไม่มี</td></tr>';
    $$('#pages tr.row', wrap).forEach((tr) => (tr.onclick = () => editPageTemplate(tr.dataset.id)));
    $$('#secs tr.row', wrap).forEach((tr) => (tr.onclick = () => editSectionTemplate(tr.dataset.id)));
    $('#newSec', wrap).onclick = async () => { const b = await pickSection(); if (!b) return; editSectionTemplate(null, b); };
    $('#newPage', wrap).onclick = () => editPageTemplate(null);
  }

  function editSectionTemplate(id, seed) {
    const t = T();
    const isNew = !id;
    const s = isNew ? { id: newId('sec'), name: '', description: '', block: seed || clone(BLANK.media) } : clone(sectionTpl(id));
    crumb([['เทมเพลตเนื้อหา', 'templates'], [isNew ? 'ส่วนสำเร็จรูปใหม่' : s.name]]);
    const name = F.text('ชื่อเทมเพลต *', s.name), desc = F.text('คำอธิบายสั้น', s.description);
    const ed = blockEditor(s.block, 'products');
    const preview = h(`<div class="hint">ประเภท: ${BTYPES[typeOf(s.block)]} — ใส่ {{title}} ในข้อความได้ ระบบจะแทนด้วยชื่อสินค้า/บทความตอนนำไปใช้</div>`);
    formShell(isNew ? 'สร้างส่วนสำเร็จรูป' : `แก้ไขเทมเพลต: ${s.name}`, [F.group({ a: name, b: desc }), preview, h('<h3>เนื้อหาตั้งต้น</h3>'), ed], () => {
      if (!name.get()) throw new Error('กรุณาตั้งชื่อเทมเพลต');
      Object.assign(s, { name: name.get(), description: desc.get(), block: ed.get() });
      if (isNew) t.sections.push(s); else t.sections[t.sections.findIndex((x) => x.id === s.id)] = s;
      markDirty('templates'); toast('บันทึกเทมเพลตแล้ว'); go('templates');
    }, isNew ? null : () => {
      const used = t.pages.filter((p) => (p.sections || []).includes(s.id));
      if (used.length && !confirm(`เทมเพลตนี้ถูกใช้ใน: ${used.map((p) => p.name).join(', ')}\nลบแล้วส่วนนี้จะหายจากเทมเพลตเหล่านั้น ยืนยัน?`)) return;
      t.sections = t.sections.filter((x) => x.id !== s.id);
      t.pages.forEach((p) => { if (p.sections) p.sections = p.sections.filter((x) => x !== s.id); });
      markDirty('templates'); go('templates');
    });
  }

  function editPageTemplate(id) {
    const t = T();
    const isNew = !id;
    const p = isNew ? { id: newId('page'), name: '', for: 'product', description: '', blocks: [] } : clone(t.pages.find((x) => x.id === id));
    crumb([['เทมเพลตเนื้อหา', 'templates'], [isNew ? 'เทมเพลตทั้งหน้าใหม่' : p.name]]);
    const name = F.text('ชื่อเทมเพลต *', p.name), desc = F.text('คำอธิบายสั้น', p.description);
    const forF = F.select('ใช้กับ', p.for || 'product', [['product', 'สินค้า'], ['blog', 'บทความ / รีวิว'], ['any', 'ทุกประเภท']]);
    const blocks = blocksField('ส่วนเนื้อหาในเทมเพลตนี้ (เรียงจากบนลงล่าง)', pageBlocks(p), { folder: 'products', kind: p.for, hideTemplateButtons: true });
    formShell(isNew ? 'สร้างเทมเพลตทั้งหน้า' : `แก้ไขเทมเพลต: ${p.name}`, [F.group({ a: name, b: forF }), desc, blocks], () => {
      if (!name.get()) throw new Error('กรุณาตั้งชื่อเทมเพลต');
      const out = { id: p.id, name: name.get(), for: forF.get(), description: desc.get(), blocks: blocks.get() };
      if (isNew) t.pages.push(out); else t.pages[t.pages.findIndex((x) => x.id === p.id)] = out;
      markDirty('templates'); toast('บันทึกเทมเพลตแล้ว'); go('templates');
    }, isNew ? null : () => {
      t.pages = t.pages.filter((x) => x.id !== p.id);
      ['product', 'blog'].forEach((k) => { if (t.defaults?.[k] === p.id) t.defaults[k] = ''; });
      markDirty('templates'); go('templates');
    });
  }

  const defaultBlocks = (kind) => { const id = T().defaults?.[kind]; const tpl = id && T().pages.find((p) => p.id === id); return tpl ? pageBlocks(tpl) : []; };

  // ---------------- views ----------------
  const view = () => $('#view');
  function crumb(parts) {
    $('#crumb').innerHTML = parts.map((p, i) => (i < parts.length - 1 && p[1] ? `<a data-go="${p[1]}">${esc(p[0])}</a>` : esc(p[0]))).join(' / ');
    $$('#crumb a').forEach((a) => (a.onclick = () => go(a.dataset.go)));
  }
  function go(tab) {
    state.tab = tab;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    ({ products: listProducts, blogs: listBlogs, categories: listCategories, banners: editBanners, settings: editSettings, pages: editPages, templates: listTemplates })[tab]();
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
    const p = isNew ? { id: Math.max(0, ...d.products.map((x) => x.id)) + 1, slug: '', title: '', subtitle: '', parent: 0, categories: [], featured: false, active: true, order: d.products.length, cover: '', catalog: '', youtube: '', about_html: '', gallery: [], blocks: defaultBlocks('product'), related_blogs: [], meta_title: '', meta_description: '', meta_keywords: '' } : clone(d.products.find((x) => x.id === id));
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
    const blocks = blocksField('ส่วนเนื้อหาของหน้าสินค้า (ใต้ About Product)', p.blocks, { folder: 'products', kind: 'product', vars: () => ({ title: f.title.get() }) });
    const rel = F.checks('บทความที่เกี่ยวข้อง', p.related_blogs, d.blogs.filter((b) => b.type === 'blog').map((b) => [b.slug, b.title]));
    const seo = F.group({ meta_title: F.text('SEO title', p.meta_title), meta_keywords: F.text('SEO keywords', p.meta_keywords), meta_description: F.area('SEO description', p.meta_description) });
    formShell(isNew ? 'เพิ่มสินค้าใหม่' : `แก้ไข: ${p.title}`, [F.group({ a: f.title, b: f.slug }), F.group({ a: f.subtitle, b: f.parent }), cats, flags, media, yt, about, gallery, blocks, rel, h('<h3>SEO</h3>'), seo], () => {
      const title = f.title.get(); if (!title) throw new Error('กรุณาใส่ชื่อสินค้า');
      const slug = f.slug.get() || slugify(title);
      if (d.products.some((x) => x.slug === slug && x.id !== p.id)) throw new Error('Slug นี้ถูกใช้แล้ว');
      const oldSlug = p.slug;
      Object.assign(p, { title, slug, subtitle: f.subtitle.get(), parent: +f.parent.get(), categories: cats.get(), ...flags.get(), ...media.get(), youtube: yt.get(), about_html: about.get(), gallery: gallery.get(), blocks: fillVars(blocks.get(), { title }), related_blogs: rel.get(), ...seo.get() });
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
    const b = isNew ? { id: Math.max(0, ...d.blogs.map((x) => x.id)) + 1, slug: '', title: '', subtitle: '', type: 'blog', featured: false, active: true, order: 0, cover: '', blocks: defaultBlocks('blog'), meta_title: '', meta_description: '' } : clone(d.blogs.find((x) => x.id === id));
    crumb([['บทความ', 'blogs'], [isNew ? 'เพิ่มบทความใหม่' : b.title]]);
    const title = F.text('หัวข้อ *', b.title), slug = F.text('Slug', b.slug, { hint: 'เว้นว่างเพื่อสร้างจากหัวข้อ' });
    const subtitle = F.text('บรรทัดรอง (เช่น วันที่ | ผู้เขียน หรือ ชนิดกีฬา)', b.subtitle);
    const type = F.select('ประเภท', b.type, [['blog', 'บทความ (Blogs)'], ['review', 'รีวิวนักกีฬา (Product reviews)']]);
    const flags = F.group({ featured: F.check('แสดงในสไลด์ใหญ่หน้า Blog', b.featured), active: F.check('แสดงบนเว็บ', b.active !== false), order: F.num('ลำดับ', b.order) }, 'grid3');
    const cover = F.file('รูปหน้าปก', b.cover, { folder: 'blog' });
    const blocks = blocksField('เนื้อหาบทความ', b.blocks, { folder: 'blog', kind: 'blog', vars: () => ({ title: title.get() }) });
    const seo = F.group({ meta_title: F.text('SEO title', b.meta_title), meta_description: F.area('SEO description', b.meta_description) });
    formShell(isNew ? 'เพิ่มบทความใหม่' : `แก้ไข: ${b.title}`, [F.group({ a: title, b: slug }), F.group({ a: subtitle, b: type }), flags, cover, blocks, h('<h3>SEO</h3>'), seo], () => {
      const t = title.get(); if (!t) throw new Error('กรุณาใส่หัวข้อ');
      const s = slug.get() || slugify(t);
      if (d.blogs.some((x) => x.slug === s && x.id !== b.id)) throw new Error('Slug นี้ถูกใช้แล้ว');
      const old = b.slug;
      Object.assign(b, { title: t, slug: s, subtitle: subtitle.get(), type: type.get(), ...flags.get(), cover: cover.get(), blocks: fillVars(blocks.get(), { title: t }), ...seo.get() });
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
