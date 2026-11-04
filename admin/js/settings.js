// admin/js/settings.js
// General Settings, Appearance, SEO, Email, Regional, Homepage Editor, Banners
// and Legal Pages. Each screen reads and writes the real settings API.

let siteSettings = null;
let settingsMeta = null;

async function fetchSettings() {
  const data = await API.get('/api/admin/settings');
  siteSettings = data.settings;
  settingsMeta = data;
  return data.settings;
}

const saveGroup = async (group, values) => {
  const { settings } = await API.put(`/api/admin/settings/${group}`, values);
  siteSettings[group] = settings;
};

function viewError(id, err) {
  document.getElementById(id).innerHTML = `<div class="panel">${emptyStateHTML(err.message, 'warning')}</div>`;
}

// ---------- Website identity ----------
const IDENTITY_FIELDS = [
  { heading: 'Your website' },
  { name: 'site_name', label: 'Website name', max: 100 },
  { name: 'tagline', label: 'Tagline', max: 160 },
  { name: 'description', label: 'Website description', type: 'textarea', max: 500, help: 'Shown in the footer.' },
  { heading: 'Logos' },
  { name: 'logo', label: 'Main logo (for light backgrounds)', type: 'media', span: 1, help: 'Leave empty to use the built-in logo.' },
  { name: 'logo_alt', label: 'Alternative logo (for the dark footer)', type: 'media', span: 1 },
  { name: 'favicon', label: 'Favicon', type: 'media', span: 1, help: 'A square image.' },
  { name: 'email_logo', label: 'Email logo', type: 'media', span: 1, help: 'Shown on a white header in emails.' },
  { heading: 'Contact details' },
  { name: 'contact_email', label: 'Contact email', type: 'email', span: 1 },
  { name: 'support_email', label: 'Support email', type: 'email', span: 1 },
  { name: 'phone', label: 'Phone number', span: 1, max: 40 },
  { name: 'address', label: 'Business address', span: 1, max: 300 },
  { heading: 'Social media' },
  { name: 'social_tiktok', label: 'TikTok', type: 'url', span: 1 },
  { name: 'social_youtube', label: 'YouTube', type: 'url', span: 1 },
  { name: 'social_whatsapp', label: 'WhatsApp', type: 'url', span: 1 },
  { name: 'social_facebook', label: 'Facebook', type: 'url', span: 1 },
  { name: 'social_instagram', label: 'Instagram', type: 'url', span: 1 },
  { name: 'social_x', label: 'X', type: 'url', span: 1 }
];

async function loadIdentityView() {
  try {
    const { identity } = await fetchSettings();
    renderSettingsForm('view-settings', { fields: IDENTITY_FIELDS, values: identity, onSave: (v) => saveGroup('identity', v) });
  } catch (err) { viewError('view-settings', err); }
}

// ---------- SEO ----------
const SEO_FIELDS = [
  { heading: 'Homepage listing' },
  { name: 'meta_title', label: 'Website meta title', max: 120 },
  { name: 'meta_description', label: 'Meta description', type: 'textarea', max: 320 },
  { name: 'og_image', label: 'Default sharing image', type: 'media', help: 'Shown when a page is shared on social media. Aim for 1200 × 630 pixels.' },
  { name: 'twitter_handle', label: 'X handle', max: 50, span: 1, placeholder: '@yourname' },
  { name: 'canonical_base', label: 'Canonical website address', type: 'url', span: 1, help: 'Leave empty to use the configured site address.' },
  { heading: 'Search engines' },
  { name: 'google_verification', label: 'Google verification code', max: 200, help: 'Only the code from the content="…" part of the tag Google gives you.' },
  { name: 'allow_indexing', label: 'Allow search engines to list this website', type: 'checkbox' },
  { name: 'robots_extra', label: 'Extra robots.txt rules', type: 'textarea', rows: 3, max: 2000 },
  { heading: 'Sitemap' },
  { name: 'sitemap_products', label: 'Include products', type: 'checkbox', span: 1 },
  { name: 'sitemap_categories', label: 'Include categories', type: 'checkbox', span: 1 },
  { name: 'sitemap_pages', label: 'Include pages', type: 'checkbox', span: 1 }
];

async function loadSeoView() {
  try {
    const { seo } = await fetchSettings();
    renderSettingsForm('view-seo', {
      fields: SEO_FIELDS,
      values: seo,
      onSave: (v) => saveGroup('seo', v),
      extra: '<p class="muted-cell" style="margin-bottom:12px;">Your sitemap is at <a class="link" href="/sitemap.xml" target="_blank" rel="noopener">/sitemap.xml</a> and robots rules at <a class="link" href="/robots.txt" target="_blank" rel="noopener">/robots.txt</a>.</p>'
    });
  } catch (err) { viewError('view-seo', err); }
}

// ---------- Email ----------
const EMAIL_FIELDS = [
  { heading: 'Sender' },
  { name: 'sender_name', label: 'Sender name', span: 1, max: 100 },
  { name: 'sender_email', label: 'Sender email', type: 'email', span: 1, help: 'Must use a domain verified in Resend.' },
  { name: 'reply_to', label: 'Reply-to address', type: 'email', span: 1 },
  { heading: 'Newsletter' },
  { name: 'newsletter_enabled', label: 'Accept newsletter signups', type: 'checkbox' },
  { name: 'welcome_enabled', label: 'Send a welcome email after someone confirms', type: 'checkbox' },
  { heading: 'Product announcements' },
  { name: 'announcement_default_products', label: 'Products in a weekly newsletter draft', type: 'number', min: 1, max: 12, span: 1 },
  { heading: 'Notifications to you' },
  { name: 'notify_email', label: 'Send notifications to', type: 'email', span: 1 },
  { name: 'notify_new_subscriber', label: 'Someone confirms a subscription', type: 'checkbox' },
  { name: 'notify_contact_message', label: 'Someone sends a contact message', type: 'checkbox' }
];

async function loadEmailSettingsView() {
  try {
    const { email } = await fetchSettings();
    const status = settingsMeta.email;
    const line = (ok, text) => `<li class="${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'warning')} ${escapeHtml(text)}</li>`;
    renderSettingsForm('view-email-settings', {
      fields: EMAIL_FIELDS,
      values: email,
      onSave: (v) => saveGroup('email', v),
      extra: `<div class="panel"><h3 class="form-heading">Resend status</h3><ul class="status-list">
        ${line(status.keySet, status.keySet ? 'API key is set on the server' : 'RESEND_API_KEY is not set on the server')}
        ${line(status.connected, status.connected ? 'Ready to send' : 'Add a sender address to start sending')}
        ${line(status.webhookSet, status.webhookSet ? 'Delivery reports are connected' : 'RESEND_WEBHOOK_SECRET is not set, so delivery statistics stay empty')}
      </ul><p class="muted-cell">The API key stays on the server and is never shown here.</p></div>`
    });
  } catch (err) { viewError('view-email-settings', err); }
}

// ---------- Regional ----------
const REGIONAL_FIELDS = [
  { name: 'country', label: 'Default country', span: 1, max: 60 },
  { name: 'locale', label: 'Language and number format', type: 'select', span: 1, options: [['en-NG', 'English (Nigeria)'], ['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['en-GH', 'English (Ghana)'], ['en-KE', 'English (Kenya)'], ['en-ZA', 'English (South Africa)'], ['fr-FR', 'French (France)']], help: 'Sets number formats and the page language. Website text isn’t translated.' },
  { name: 'currency', label: 'Currency code', span: 1, max: 3, help: 'Changes the symbol shown. Prices aren’t converted, so update them too.' },
  { name: 'timezone', label: 'Time zone', span: 1, placeholder: 'Africa/Lagos' },
  { name: 'date_format', label: 'Date format', type: 'select', span: 1, options: [['medium', '1 Nov 2026'], ['long', '1 November 2026'], ['numeric', '01/11/2026']] },
  { name: 'time_format', label: 'Time format', type: 'select', span: 1, options: [['12h', '2:30 PM'], ['24h', '14:30']] }
];

async function loadRegionalView() {
  try {
    const { regional } = await fetchSettings();
    renderSettingsForm('view-regional', { fields: REGIONAL_FIELDS, values: regional, onSave: (v) => saveGroup('regional', { ...v, currency: v.currency.toUpperCase() }) });
  } catch (err) { viewError('view-regional', err); }
}

// ---------- Appearance, with live preview ----------
const APPEARANCE_FIELDS = [
  { heading: 'Colours' },
  { name: 'primary', label: 'Primary (buttons, links)', type: 'color', span: 1 },
  { name: 'secondary', label: 'Secondary (hero, footer)', type: 'color', span: 1 },
  { name: 'accent', label: 'Accent (highlights)', type: 'color', span: 1 },
  { name: 'background', label: 'Background', type: 'color', span: 1 },
  { name: 'text', label: 'Text', type: 'color', span: 1 },
  { heading: 'Theme' },
  { name: 'default_theme', label: 'Default theme', type: 'select', span: 1, options: [['light', 'Light'], ['dark', 'Dark'], ['system', 'Follow the visitor’s device']] },
  { name: 'allow_theme_toggle', label: 'Let visitors switch between light and dark', type: 'checkbox', span: 1 },
  { heading: 'Typography and shapes' },
  { name: 'font', label: 'Typeface', type: 'select', span: 1, options: [['jakarta', 'Plus Jakarta Sans'], ['system', 'Device default'], ['serif', 'Georgia (serif)']] },
  { name: 'base_font_size', label: 'Text size (px)', type: 'number', min: 14, max: 20, span: 1 },
  { name: 'button_style', label: 'Button style', type: 'select', span: 1, options: [['rounded', 'Rounded'], ['pill', 'Pill'], ['square', 'Square']] },
  { name: 'border_radius', label: 'Corner radius', type: 'select', span: 1, options: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']] },
  { heading: 'Layout' },
  { name: 'container_width', label: 'Page width (px)', type: 'number', min: 960, max: 1600, step: 20, span: 1 },
  { name: 'product_columns', label: 'Products per row', type: 'select', span: 1, options: [['auto', 'Automatic'], ['3', '3'], ['4', '4'], ['5', '5']] }
];

async function loadAppearanceView() {
  try {
    const { appearance } = await fetchSettings();
    const section = document.getElementById('view-appearance');
    section.innerHTML = `<div class="appearance-grid">
      <form class="panel" novalidate>
        <div class="form-grid">${formHTML(APPEARANCE_FIELDS, appearance)}</div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Save and apply</button><button type="button" class="btn btn-ghost" data-reset>Undo changes</button></div>
        <div class="form-msg" style="display:none;"></div>
      </form>
      <div class="panel preview-panel">
        <div class="panel-head"><h3>Live preview</h3><span class="muted-cell">Nothing changes for visitors until you save.</span></div>
        <iframe id="themePreview" src="/" title="Preview of the website"></iframe>
      </div></div>`;
    const form = section.querySelector('form');
    const frame = document.getElementById('themePreview');
    let timer;
    const applyPreview = async () => {
      try {
        const { css, theme } = await API.post('/api/admin/settings/appearance/preview', readForm(form, APPEARANCE_FIELDS));
        const doc = frame.contentDocument;
        if (!doc) return;
        let style = doc.getElementById('livePreviewStyle');
        if (!style) {
          style = doc.createElement('style');
          style.id = 'livePreviewStyle';
          doc.head.append(style);
        }
        style.textContent = css;
        doc.documentElement.setAttribute('data-theme', theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme);
        setFormMessageHidden(form);
      } catch (err) {
        setFormMessage(form.querySelector('.form-msg'), err.message, 'error');
      }
    };
    form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(applyPreview, 200); });
    form.addEventListener('change', () => { clearTimeout(timer); timer = setTimeout(applyPreview, 50); });
    form.querySelector('[data-reset]').addEventListener('click', loadAppearanceView);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await saveGroup('appearance', readForm(form, APPEARANCE_FIELDS));
        toast('Saved and applied to the website.');
        frame.contentWindow.location.reload();
      } catch (err) {
        setFormMessage(form.querySelector('.form-msg'), err.message, 'error');
      }
    });
  } catch (err) { viewError('view-appearance', err); }
}

function setFormMessageHidden(form) {
  form.querySelector('.form-msg').style.display = 'none';
}

// ---------- Homepage editor ----------
async function loadHomepageView() {
  try {
    const [{ homepage }, { items }] = await Promise.all([fetchSettings(), API.get('/api/admin/products?status=published&perPage=100')]);
    const labels = Object.fromEntries(settingsMeta.sections.map((s) => [s.key, s.label]));
    let sections = homepage.sections.map((s) => ({ ...s }));
    let picked = homepage.featured_product_ids.filter((id) => items.some((p) => p.id === id));
    const section = document.getElementById('view-homepage');
    section.innerHTML = `<form novalidate>
      <div class="panel"><h3 class="form-heading">Hero</h3><div class="form-grid">
        ${formHTML([
          { name: 'hero_headline', label: 'Headline', span: 1, max: 120 },
          { name: 'hero_highlight', label: 'Highlighted second line', span: 1, max: 120 },
          { name: 'hero_description', label: 'Description', type: 'textarea', max: 400 },
          { name: 'hero_background', label: 'Background image', type: 'media', help: 'Leave empty for the brand colours. Text stays readable over a dark overlay.' }
        ], homepage)}
      </div></div>
      <div class="panel"><h3 class="form-heading">Promotional bar</h3><p class="muted-cell" style="margin-bottom:10px;">A message across the top of every page.</p><div class="form-grid">
        ${formHTML([
          { name: 'promo_enabled', label: 'Show the promotional bar', type: 'checkbox' },
          { name: 'promo_message', label: 'Message', span: 1, max: 200 },
          { name: 'promo_link', label: 'Link (optional)', span: 1 }
        ], homepage)}
      </div></div>
      <div class="panel"><h3 class="form-heading">Sections</h3><p class="muted-cell" style="margin-bottom:10px;">Reorder or switch off. A section with no content stays hidden automatically.</p><div id="homeSectionList"></div></div>
      <div class="panel"><h3 class="form-heading">Featured products</h3><p class="muted-cell" style="margin-bottom:10px;">Pick which products appear, in order. If none are picked, products marked Featured are used.</p><div id="homeFeaturedList" class="picker"></div></div>
      <div class="modal-actions"><button type="submit" class="btn btn-primary">Save and apply</button><a class="btn btn-ghost" href="/" target="_blank" rel="noopener">View homepage</a><a class="btn btn-ghost" href="#banners">Manage banners</a><a class="btn btn-ghost" href="#testimonials">Manage testimonials</a></div>
      <div class="form-msg" style="display:none;"></div>
    </form>`;
    const drawSections = () => {
      document.getElementById('homeSectionList').innerHTML = sections.map((s, i) => `
        <div class="list-row"><label class="switch-row"><input type="checkbox" data-toggle="${i}" ${s.enabled ? 'checked' : ''} /> <span>${escapeHtml(labels[s.key] || s.key)}</span></label>
          <span class="row-actions"><button type="button" class="btn btn-ghost btn-sm" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button type="button" class="btn btn-ghost btn-sm" data-down="${i}" ${i === sections.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button></span></div>`).join('');
    };
    const drawFeatured = () => {
      const ordered = [...picked.map((id) => items.find((p) => p.id === id)), ...items.filter((p) => !picked.includes(p.id))];
      document.getElementById('homeFeaturedList').innerHTML = ordered.map((p) => `
        <label class="picker-row"><input type="checkbox" data-pick="${Number(p.id)}" ${picked.includes(p.id) ? 'checked' : ''} /><img class="table-thumb" src="${escapeHtml((p.images && p.images[0]) || '/images/placeholder-product.svg')}" alt="" loading="lazy" /><span>${escapeHtml(String(p.name).trim())}</span>${picked.includes(p.id) ? `<span class="pill pill-green">${picked.indexOf(p.id) + 1}</span>` : ''}</label>`).join('') || emptyStateHTML('No published products yet.');
    };
    drawSections();
    drawFeatured();
    const form = section.querySelector('form');
    form.addEventListener('click', (e) => {
      const up = e.target.closest('[data-up]');
      const down = e.target.closest('[data-down]');
      if (up || down) {
        const i = Number((up || down).dataset.up ?? (up || down).dataset.down);
        const j = up ? i - 1 : i + 1;
        [sections[i], sections[j]] = [sections[j], sections[i]];
        drawSections();
      }
    });
    form.addEventListener('change', (e) => {
      if (e.target.dataset.toggle !== undefined) sections[Number(e.target.dataset.toggle)].enabled = e.target.checked;
      if (e.target.dataset.pick !== undefined) {
        const id = Number(e.target.dataset.pick);
        picked = e.target.checked ? [...picked, id] : picked.filter((x) => x !== id);
        drawFeatured();
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = {
        hero_headline: form.elements.hero_headline.value,
        hero_highlight: form.elements.hero_highlight.value,
        hero_description: form.elements.hero_description.value,
        hero_background: form.elements.hero_background.value,
        promo_enabled: form.elements.promo_enabled.checked,
        promo_message: form.elements.promo_message.value,
        promo_link: form.elements.promo_link.value,
        sections,
        featured_product_ids: picked
      };
      try {
        await saveGroup('homepage', values);
        form.querySelector('.form-msg').style.display = 'none';
        toast('Saved and applied to the website.');
      } catch (err) {
        setFormMessage(form.querySelector('.form-msg'), err.message, 'error');
      }
    });
  } catch (err) { viewError('view-homepage', err); }
}

// ---------- Banners ----------
const BANNER_FIELDS = [
  { name: 'title', label: 'Title', max: 150 },
  { name: 'message', label: 'Message', type: 'textarea', rows: 2, max: 400 },
  { name: 'image_url', label: 'Image', type: 'media' },
  { name: 'link_url', label: 'Link (optional)' },
  { name: 'placement', label: 'Where it appears', type: 'select', span: 1, options: [['home_top', 'Top of homepage'], ['home_middle', 'Middle of homepage'], ['home_bottom', 'Bottom of homepage']] },
  { name: 'sort_order', label: 'Order', type: 'number', min: 0, max: 999, span: 1 },
  { name: 'starts_at', label: 'Show from (optional)', type: 'datetime-local', span: 1 },
  { name: 'ends_at', label: 'Show until (optional)', type: 'datetime-local', span: 1 },
  { name: 'is_active', label: 'Active', type: 'checkbox' }
];
const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

async function loadBannersView() {
  const section = document.getElementById('view-banners');
  try {
    const { banners } = await API.get('/api/admin/banners');
    const places = { home_top: 'Top', home_middle: 'Middle', home_bottom: 'Bottom' };
    section.innerHTML = `<div class="panel-head"><h3>Homepage banners</h3><button type="button" class="btn btn-primary btn-sm" data-new>${icon('plus')} Add banner</button></div>
      <div class="panel table-panel"><table><thead><tr><th>Banner</th><th>Placement</th><th>Dates</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${banners.length ? banners.map((b) => `<tr>
        <td class="product-cell">${b.image_url ? `<img class="table-thumb" src="${escapeHtml(b.image_url)}" alt="" />` : ''}<span>${escapeHtml(b.title)}</span></td>
        <td>${places[b.placement]}</td>
        <td class="muted-cell">${b.starts_at ? formatDateOnly(b.starts_at) : 'Now'} – ${b.ends_at ? formatDateOnly(b.ends_at) : 'No end'}</td>
        <td>${b.is_active ? '<span class="pill pill-green">Active</span>' : '<span class="pill pill-gray">Off</span>'}</td>
        <td class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="${Number(b.id)}">Edit</button><button class="btn btn-danger btn-sm" data-del="${Number(b.id)}">Delete</button></td></tr>`).join('') : emptyRow(5, 'No banners yet.')}
      </tbody></table></div>`;
    const open = (banner) => openFormModal({
      title: banner ? 'Edit banner' : 'Add banner',
      fields: BANNER_FIELDS,
      values: banner ? { ...banner, starts_at: toLocalInput(banner.starts_at), ends_at: toLocalInput(banner.ends_at) } : { is_active: true, placement: 'home_top', sort_order: 0 },
      onSave: async (v) => {
        const body = { ...v, starts_at: fromLocalInput(v.starts_at), ends_at: fromLocalInput(v.ends_at) };
        if (banner) await API.put(`/api/admin/banners/${banner.id}`, body);
        else await API.post('/api/admin/banners', body);
        toast('Saved.');
        loadBannersView();
      }
    });
    section.onclick = async (e) => {
      if (e.target.closest('[data-new]')) return open();
      const edit = e.target.closest('[data-edit]');
      if (edit) return open(banners.find((b) => b.id === Number(edit.dataset.edit)));
      const del = e.target.closest('[data-del]');
      if (del && confirm('Delete this banner?')) {
        try {
          await API.del(`/api/admin/banners/${del.dataset.del}`);
          loadBannersView();
        } catch (err) { toast(err.message, 'error'); }
      }
      return undefined;
    };
  } catch (err) { viewError('view-banners', err); }
}

// ---------- Legal pages: save, preview, publish ----------
async function loadPagesView(activeSlug) {
  const section = document.getElementById('view-pages');
  try {
    const { pages } = await API.get('/api/admin/pages');
    const page = pages.find((p) => p.slug === activeSlug) || pages[0];
    section.innerHTML = `<div class="tab-bar">${pages.map((p) => `<button type="button" class="tab-btn${p.slug === page.slug ? ' active' : ''}" data-page="${escapeHtml(p.slug)}">${escapeHtml(p.title)}</button>`).join('')}</div>
      <div class="panel">
        <div class="field"><label for="pageTitle">Title</label><input id="pageTitle" value="${escapeHtml(page.title)}" maxlength="150" /></div>
        <div id="pageEditor"></div>
        <p class="muted-cell" style="margin-top:10px;">${page.published_at ? `Published ${formatDateTime(page.published_at)}.` : page.published ? 'Currently showing the original page text.' : 'Not published yet: this page doesn’t exist for visitors.'} ${page.has_unpublished_changes ? 'You have changes that aren’t published.' : ''}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-save>Save draft</button>
          <button type="button" class="btn btn-ghost" data-preview>Preview</button>
          ${Permissions.can('content.publish') ? '<button type="button" class="btn btn-primary" data-publish>Publish</button>' : ''}
          ${page.published ? `<a class="btn btn-ghost" href="${escapeHtml(page.url)}" target="_blank" rel="noopener">View live page</a>` : ''}
        </div>
        <div class="form-msg" style="display:none;"></div>
      </div>`;
    const rich = new RichEditor(document.getElementById('pageEditor'), { minHeight: 360 });
    rich.setHTML(page.draft_html);
    const save = async () => API.put(`/api/admin/pages/${page.slug}`, { title: document.getElementById('pageTitle').value, draft_html: rich.getHTML() });
    section.onclick = async (e) => {
      const tab = e.target.closest('[data-page]');
      if (tab) return loadPagesView(tab.dataset.page);
      const msg = section.querySelector('.form-msg');
      try {
        if (e.target.closest('[data-save]')) {
          toast((await save()).message);
          return loadPagesView(page.slug);
        }
        if (e.target.closest('[data-preview]')) {
          await openAfterSaving(async () => {
            await save();
            return `/admin/preview/page/${page.slug}`;
          });
        }
        if (e.target.closest('[data-publish]')) {
          if (!confirm(`Publish "${document.getElementById('pageTitle').value}" to the website?`)) return undefined;
          await save();
          toast((await API.post(`/api/admin/pages/${page.slug}/publish`, {})).message);
          return loadPagesView(page.slug);
        }
      } catch (err) {
        setFormMessage(msg, err.message, 'error');
      }
      return undefined;
    };
  } catch (err) { viewError('view-pages', err); }
}
