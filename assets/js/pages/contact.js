Zenas.page(async (root, d, s) => {
  const { esc, link, icon, telHref, pageHeader, mapBlock, setMeta, $ } = Zenas;
  const pg = s.pages?.['contact-us']?.blocks || {};
  setMeta({ title: 'Contact Us' }, s);
  const started = Date.now();

  root.innerHTML = `
    ${pageHeader({ title: pg.BannersTop1?.head || 'Contact Us', sub: pg.BannersTop1?.sub || '', crumbs: [['Home', link.home()], ['Contact Us']], bg: 'assets/img/header-contact.webp' })}
    <section class="contact-page">
      <div class="container grid">
        <div>
          <h2>${esc(pg.ContactContent2?.head || 'We’re Delivering the Best Customer Experience')}</h2>
          <h4>Address</h4>
          <div class="addr">${Zenas.addressHtml(s)}</div>
          <h4>Contact Us</h4>
          <ul class="info-list" style="font-size:14px">
            <li>${icon.phone}<a href="${telHref(s.phone)}">${esc(s.phone)}</a></li>
            <li>${icon.fax}${esc(s.fax)}</li>
            <li>${icon.mail}<a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>
          </ul>
          ${s.hours ? `<p style="font-size:13px;color:var(--muted);margin-top:8px">${esc(s.hours)}</p>` : ''}
          <p style="margin-top:18px"><a class="btn btn-primary" href="${telHref(s.phone)}">Call us now</a></p>
        </div>

        <form class="form" id="form" novalidate>
          <label for="f-name">Name</label>
          <div class="field"><span class="ico">${icon.user}</span><input id="f-name" name="name" placeholder="name" autocomplete="name" required maxlength="120"></div>
          <label for="f-email">Email</label>
          <div class="field"><span class="ico">${icon.mail}</span><input id="f-email" name="email" type="email" autocomplete="email" required maxlength="160"></div>
          <label for="f-phone">Phone <span style="color:var(--muted)">(optional)</span></label>
          <div class="field"><span class="ico">${icon.phone}</span><input id="f-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>
          <label for="f-desc">Description</label>
          <div class="field"><textarea id="f-desc" name="message" required maxlength="4000"></textarea></div>
          <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <label class="agree"><input type="checkbox" id="f-agree" required> i have read and agree to the <a href="terms.html" target="_blank">terms and conditions</a></label>
          <div class="send"><button class="btn btn-primary" id="send" type="submit" disabled style="padding:9px 40px">Send</button></div>
          <div class="form-msg hidden" id="msg" role="status"></div>
        </form>
      </div>
    </section>
    ${mapBlock(s)}`;

  const form = $('#form'), btn = $('#send'), msg = $('#msg'), agree = $('#f-agree');
  agree.addEventListener('change', () => { btn.disabled = !agree.checked; });
  const show = (ok, text) => { msg.className = 'form-msg ' + (ok ? 'ok' : 'err'); msg.textContent = text; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.website) return; // bot
    if (!data.name.trim() || !/^\S+@\S+\.\S+$/.test(data.email) || !data.message.trim()) {
      show(false, 'Please fill in your name, a valid email and a message.');
      return;
    }
    const payload = { ...data, page: location.href, elapsed: Math.round((Date.now() - started) / 1000), ua: navigator.userAgent };
    delete payload.website;

    if (!s.contact_form_endpoint) {
      // No backend configured yet: hand off to the visitor's mail app so no message is lost.
      const body = `Name: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone || '-'}\n\n${data.message}`;
      location.href = `mailto:${s.email}?subject=${encodeURIComponent('Website enquiry from ' + data.name)}&body=${encodeURIComponent(body)}`;
      show(true, 'Your email app has been opened with the message. Please press send there.');
      return;
    }
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await fetch(s.contact_form_endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.error || 'Server error');
      form.reset(); show(true, 'Thank you! Your message has been sent. Our team will contact you soon.');
    } catch (err) {
      show(false, `Sorry, the message could not be sent (${err.message}). Please email ${s.email} or call ${s.phone}.`);
    } finally {
      btn.textContent = 'Send'; btn.disabled = !agree.checked;
    }
  });
});
