Zenas.page(async (root, d, s) => {
  const { esc, link, pageHeader, setMeta } = Zenas;
  const isPrivacy = document.body.dataset.page === 'privacy';
  const key = isPrivacy ? 'privacy' : 'terms';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms & Conditions';
  const html = s.legal?.[key] || '<p>Content coming soon.</p>';
  setMeta({ title }, s);
  root.innerHTML = `
    ${pageHeader({ title, sub: s.company_name, crumbs: [['Home', link.home()], [title]], bg: 'assets/img/header-contact.webp' })}
    <article class="container legal-page rich">${html.replaceAll('{{email}}', esc(s.email)).replaceAll('{{phone}}', esc(s.phone)).replaceAll('{{company}}', esc(s.company_name))}</article>`;
});
