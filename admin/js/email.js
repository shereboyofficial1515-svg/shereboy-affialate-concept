// admin/js/email.js
// Dashboard views for the newsletter: subscribers, campaigns, the send log, and
// testimonial moderation. Loaded after dashboard.js; every API call behind these
// views requires an administrator session.

const fmtDate = (value) => (value ? formatDateTime(value) : '—');
const STATUS_PILL = {
  pending: 'pill-gold', confirmed: 'pill-green', unsubscribed: 'pill-gray', bounced: 'pill-red', complained: 'pill-red',
  draft: 'pill-gray', sending: 'pill-blue', sent: 'pill-green', partial: 'pill-gold', failed: 'pill-red',
  queued: 'pill-gray', delivered: 'pill-green', delivery_delayed: 'pill-gold', opened: 'pill-green', clicked: 'pill-green'
};
const pill = (status) => `<span class="pill ${STATUS_PILL[status] || 'pill-gray'}">${escapeHtml(String(status).replace('_', ' '))}</span>`;

function tableMessage(bodyId, columns, html) {
  document.getElementById(bodyId).innerHTML = `<tr><td colspan="${columns}">${html}</td></tr>`;
}

function pagerHTML(page, totalPages, action) {
  if (totalPages <= 1) return '';
  return `<div class="pager">
    <button class="btn btn-ghost btn-sm" data-pager="${action}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
    <span>Page ${page} of ${totalPages}</span>
    <button class="btn btn-ghost btn-sm" data-pager="${action}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next</button>
  </div>`;
}

// ---------- Email status banner ----------
async function loadEmailStatus(targetId) {
  try {
    const { email, counts } = await API.get('/api/admin/email/status');
    const el = document.getElementById(targetId);
    el.hidden = email.configured && email.webhookConfigured;
    el.innerHTML = !email.configured
      ? `${icon('warning')}<span><b>Email isn't connected yet.</b> Signups are being saved, but nothing can be sent until RESEND_API_KEY and EMAIL_FROM are set on the server.</span>`
      : `${icon('warning')}<span>Sending works, but delivery statistics stay empty until RESEND_WEBHOOK_SECRET is set and the webhook is added in Resend.</span>`;
    return { email, counts };
  } catch (err) {
    return null;
  }
}

// ---------- Subscribers ----------
const subscriberFilter = { q: '', status: '', page: 1 };

async function loadSubscribers() {
  const status = await loadEmailStatus('subscriberBanner');
  if (status) {
    const { counts } = status;
    document.getElementById('subscriberStats').innerHTML = [
      ['Confirmed', counts.confirmed], ['Pending', counts.pending], ['Unsubscribed', counts.unsubscribed], ['Bounced / complained', counts.bounced + counts.complained]
    ].map(([label, value]) => `<div class="stat-card"><b>${Number(value)}</b><span>${label}</span></div>`).join('');
    document.getElementById('confirmAllBtn').hidden = !(status.email.configured && counts.pending > 0);
  }
  await fetchSubscribers();
}

async function fetchSubscribers() {
  const params = new URLSearchParams({ page: subscriberFilter.page });
  if (subscriberFilter.q) params.set('q', subscriberFilter.q);
  if (subscriberFilter.status) params.set('status', subscriberFilter.status);
  try {
    const { subscribers, page, totalPages, total } = await API.get(`/api/admin/email/subscribers?${params}`);
    const body = document.getElementById('subscribersTableBody');
    body.innerHTML = subscribers.length ? subscribers.map((s) => `
      <tr>
        <td>${escapeHtml(s.email)}</td>
        <td>${pill(s.status)}</td>
        <td>${escapeHtml(s.source || '—')}</td>
        <td class="muted-cell">${fmtDate(s.created_at)}</td>
        <td class="muted-cell">${fmtDate(s.confirmed_at)}</td>
        <td class="row-actions">
          ${s.status === 'pending' ? `<button class="btn btn-ghost btn-sm" data-sub-action="resend" data-id="${Number(s.id)}">Send confirmation</button>` : ''}
          ${s.status === 'pending' || s.status === 'confirmed' ? `<button class="btn btn-ghost btn-sm" data-sub-action="unsubscribe" data-id="${Number(s.id)}">Unsubscribe</button>` : ''}
          <button class="btn btn-danger btn-sm" data-sub-action="delete" data-id="${Number(s.id)}">Delete</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="6">${emptyStateHTML(subscriberFilter.q || subscriberFilter.status ? 'No subscribers match this search.' : 'No subscribers yet.')}</td></tr>`;
    document.getElementById('subscriberPager').innerHTML = pagerHTML(page, totalPages, 'subscribers');
    document.getElementById('subscriberTotal').textContent = `${total} shown by this filter`;
  } catch (err) {
    tableMessage('subscribersTableBody', 6, emptyStateHTML(err.message, 'warning'));
  }
}

async function subscriberAction(action, id) {
  try {
    if (action === 'resend') {
      alert((await API.post(`/api/admin/email/subscribers/${id}/resend-confirmation`, {})).message);
    } else if (action === 'unsubscribe') {
      if (!confirm('Stop all marketing email to this subscriber?')) return;
      await API.post(`/api/admin/email/subscribers/${id}/unsubscribe`, {});
    } else if (action === 'delete') {
      if (!confirm('Permanently delete this subscriber? To keep them from being emailed, Unsubscribe is usually better.')) return;
      await API.del(`/api/admin/email/subscribers/${id}`);
    }
    loadSubscribers();
  } catch (err) { alert(err.message); }
}

// ---------- Campaigns ----------
let campaignProducts = [];
const WEEKLY_TEMPLATE = { subject: 'This week\'s top picks', heading: 'This week\'s top picks', preheader: 'New products and the best savings we\'ve found this week.', body: 'Here are the products we\'re recommending this week.' };

async function loadCampaigns() {
  loadEmailStatus('campaignBanner');
  try {
    const { campaigns } = await API.get('/api/admin/email/campaigns');
    const body = document.getElementById('campaignsTableBody');
    body.innerHTML = campaigns.length ? campaigns.map((c) => {
      const stuck = c.status === 'sending' && !c.running;
      return `
      <tr>
        <td><b>${escapeHtml(c.subject)}</b><br><span class="muted-cell">${escapeHtml(c.kind)} · ${fmtDate(c.created_at)}</span></td>
        <td>${pill(c.status)}${stuck ? '<br><span class="muted-cell">interrupted</span>' : ''}</td>
        <td class="num">${c.status === 'draft' ? '—' : `${c.stats.sent} of ${c.recipient_count || c.stats.sent + c.stats.failed}`}</td>
        <td class="num">${c.stats.delivered}</td>
        <td class="num">${c.stats.opened}</td>
        <td class="num">${c.stats.clicked}</td>
        <td class="num">${c.stats.bounced + c.stats.complained + c.stats.failed}</td>
        <td class="row-actions">
          ${c.status === 'draft' ? `
            <button class="btn btn-ghost btn-sm" data-camp-action="edit" data-id="${Number(c.id)}">Edit</button>
            <button class="btn btn-ghost btn-sm" data-camp-action="test" data-id="${Number(c.id)}">Send test</button>
            <button class="btn btn-gold btn-sm" data-camp-action="send" data-id="${Number(c.id)}">Send</button>
            <button class="btn btn-danger btn-sm" data-camp-action="delete" data-id="${Number(c.id)}">Delete</button>` : ''}
          ${stuck || c.status === 'partial' || c.status === 'failed' ? `<button class="btn btn-ghost btn-sm" data-camp-action="resume" data-id="${Number(c.id)}">${stuck ? 'Resume' : 'Retry failed'}</button>` : ''}
          ${c.status === 'sent' || (c.status === 'sending' && !stuck) ? '<span class="muted-cell">—</span>' : ''}
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="8">${emptyStateHTML('No campaigns yet. Create your first one above.')}</td></tr>`;
    if (campaigns.some((c) => c.running)) setTimeout(() => { if (!document.getElementById('view-campaigns').hidden) loadCampaigns(); }, 5000);
  } catch (err) {
    tableMessage('campaignsTableBody', 8, emptyStateHTML(err.message, 'warning'));
  }
}

async function ensureCampaignProducts() {
  if (campaignProducts.length) return;
  const { items } = await API.get('/api/products?perPage=100&sort=newest');
  campaignProducts = items;
}

function renderProductPicker(selected = []) {
  // Chosen products keep the order they were picked in
  document.getElementById('campaignProductList').innerHTML = campaignProducts.map((p) => `
    <label class="picker-row">
      <input type="checkbox" value="${Number(p.id)}" ${selected.includes(p.id) ? 'checked' : ''} />
      <img class="table-thumb" src="${escapeHtml((p.images && p.images[0]) || '/images/placeholder-product.svg')}" alt="" loading="lazy" />
      <span>${escapeHtml(p.name)}</span>
      <span class="muted-cell">${formatNaira(p.final_price)}</span>
      ${p.images_missing ? '<span class="pill pill-red">no image</span>' : ''}
    </label>`).join('') || emptyStateHTML('No products yet.');
}

async function openCampaignModal(campaign, preset) {
  await ensureCampaignProducts();
  const values = campaign || preset || {};
  document.getElementById('campaignId').value = campaign ? campaign.id : '';
  document.getElementById('campaignModalTitle').textContent = campaign ? 'Edit campaign' : 'New campaign';
  document.getElementById('campaignKind').value = values.kind || 'announcement';
  document.getElementById('campaignSubject').value = values.subject || '';
  document.getElementById('campaignPreheader').value = values.preheader || '';
  document.getElementById('campaignHeading').value = values.heading || '';
  document.getElementById('campaignBody').value = values.body || '';
  document.getElementById('campaignFormMsg').style.display = 'none';
  renderProductPicker(values.product_ids || []);
  document.getElementById('campaignModalOverlay').classList.add('open');
  // Only offered when this feature is on and a provider is connected
  API.get('/api/admin/ai/available').then(({ configured, actions }) => {
    document.getElementById('campaignAi').hidden = !(configured && actions.email);
  }).catch(() => {});
}

// A weekly newsletter starts from what was added in the last 7 days, then the
// biggest savings. It's only a starting point: the admin reviews it before sending.
async function openWeeklyCampaign() {
  try {
    await ensureCampaignProducts();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const fresh = campaignProducts.filter((p) => new Date(p.date_added).getTime() > weekAgo);
    const savings = [...campaignProducts].sort((a, b) => b.discount_percent - a.discount_percent);
    const { settings } = await API.get('/api/admin/settings');
    const picks = [...new Map([...fresh, ...savings].filter((p) => !p.images_missing).map((p) => [p.id, p])).values()].slice(0, settings.email.announcement_default_products).map((p) => p.id);
    openCampaignModal(null, { ...WEEKLY_TEMPLATE, kind: 'weekly', product_ids: picks });
  } catch (err) { alert(err.message); }
}

function bindCampaignModal() {
  const overlay = document.getElementById('campaignModalOverlay');
  const close = () => overlay.classList.remove('open');
  document.getElementById('campaignModalClose').addEventListener('click', close);
  document.getElementById('cancelCampaignBtn').addEventListener('click', close);
  document.getElementById('newCampaignBtn').addEventListener('click', () => openCampaignModal().catch((err) => alert(err.message)));
  document.getElementById('weeklyCampaignBtn').addEventListener('click', openWeeklyCampaign);
  document.getElementById('campaignAi').addEventListener('click', draftCampaignWithAi);

  document.getElementById('campaignForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;
    const id = document.getElementById('campaignId').value;
    const payload = {
      kind: document.getElementById('campaignKind').value,
      subject: document.getElementById('campaignSubject').value,
      preheader: document.getElementById('campaignPreheader').value,
      heading: document.getElementById('campaignHeading').value,
      body: document.getElementById('campaignBody').value,
      product_ids: [...document.querySelectorAll('#campaignProductList input:checked')].map((input) => Number(input.value))
    };
    submitBtn.disabled = true;
    try {
      if (id) await API.put(`/api/admin/email/campaigns/${id}`, payload);
      else await API.post('/api/admin/email/campaigns', payload);
      close();
      loadCampaigns();
    } catch (err) {
      setFormMessage(document.getElementById('campaignFormMsg'), err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// Fills the form from the chosen products. Nothing sends until an admin presses Send.
async function draftCampaignWithAi(e) {
  const chosen = [...document.querySelectorAll('#campaignProductList input:checked')].map((input) => campaignProducts.find((p) => p.id === Number(input.value))).filter(Boolean);
  const text = chosen.map((p) => `${String(p.name).trim()}: ${formatNaira(p.final_price)}`).join('\n');
  if (!text && !document.getElementById('campaignBody').value.trim()) return toast('Choose some products or write a few notes first.', 'error');
  e.target.disabled = true;
  try {
    const { fields, flags } = await API.post('/api/admin/ai/generate', { action: 'email', text: `${document.getElementById('campaignBody').value}\n\nProducts:\n${text}` });
    if (fields.subject) document.getElementById('campaignSubject').value = String(fields.subject).slice(0, 150);
    if (fields.heading) document.getElementById('campaignHeading').value = String(fields.heading).slice(0, 150);
    if (fields.preheader) document.getElementById('campaignPreheader').value = String(fields.preheader).slice(0, 150);
    if (fields.body) document.getElementById('campaignBody').value = fields.body;
    toast(flags.length ? `Drafted. Check these aren't invented: ${flags.join(', ')}` : 'Drafted. Review it before saving.', flags.length ? 'error' : 'success');
  } catch (err) { toast(err.message, 'error'); } finally { e.target.disabled = false; }
  return undefined;
}

async function campaignAction(action, id) {
  try {
    if (action === 'edit') {
      const { campaign } = await API.get(`/api/admin/email/campaigns/${id}`);
      await openCampaignModal(campaign);
    } else if (action === 'test') {
      const to = prompt('Send a test to which address? Leave empty to use your admin email.', '');
      if (to === null) return;
      alert((await API.post(`/api/admin/email/campaigns/${id}/test`, { email: to })).message);
    } else if (action === 'send') {
      const { counts } = await API.get('/api/admin/email/status');
      if (!confirm(`Send this campaign to ${counts.confirmed} confirmed subscriber${counts.confirmed === 1 ? '' : 's'}? This can't be undone.`)) return;
      alert((await API.post(`/api/admin/email/campaigns/${id}/send`, {})).message);
      loadCampaigns();
    } else if (action === 'resume') {
      alert((await API.post(`/api/admin/email/campaigns/${id}/resume`, {})).message);
      loadCampaigns();
    } else if (action === 'delete') {
      if (!confirm('Delete this draft?')) return;
      await API.del(`/api/admin/email/campaigns/${id}`);
      loadCampaigns();
    }
  } catch (err) { alert(err.message); }
}

// ---------- Send log ----------
let logPage = 1;
async function loadLogs() {
  try {
    const { logs, page, totalPages } = await API.get(`/api/admin/email/logs?page=${logPage}`);
    document.getElementById('logsTableBody').innerHTML = logs.length ? logs.map((l) => `
      <tr>
        <td class="muted-cell">${fmtDate(l.created_at)}</td>
        <td>${escapeHtml(l.email)}</td>
        <td>${escapeHtml(l.kind)}</td>
        <td>${escapeHtml(l.subject || '—')}</td>
        <td>${pill(l.status)}</td>
        <td class="muted-cell" style="max-width:260px;">${escapeHtml(l.error || '')}</td>
      </tr>`).join('') : `<tr><td colspan="6">${emptyStateHTML('Nothing has been sent yet.')}</td></tr>`;
    document.getElementById('logPager').innerHTML = pagerHTML(page, totalPages, 'logs');
  } catch (err) {
    tableMessage('logsTableBody', 6, emptyStateHTML(err.message, 'warning'));
  }
}

// ---------- Testimonials ----------
let allTestimonials = [];
async function loadTestimonials() {
  try {
    const { testimonials } = await API.get('/api/testimonials/all');
    allTestimonials = testimonials;
    document.getElementById('testimonialsTableBody').innerHTML = testimonials.length ? testimonials.map((t) => `
      <tr>
        <td>${escapeHtml(t.customer_name)}</td>
        <td style="max-width:360px;">${escapeHtml(t.quote)}</td>
        <td class="num">${Number(t.rating)}/5</td>
        <td>${t.is_published ? '<span class="pill pill-green">Published</span>' : '<span class="pill pill-gray">Hidden</span>'}</td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" data-testi-action="edit" data-id="${Number(t.id)}">Edit</button>
          <button class="btn btn-danger btn-sm" data-testi-action="delete" data-id="${Number(t.id)}">Delete</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="5">${emptyStateHTML('No testimonials yet.')}</td></tr>`;
  } catch (err) {
    tableMessage('testimonialsTableBody', 5, emptyStateHTML(err.message, 'warning'));
  }
}

function openTestimonialModal(t) {
  document.getElementById('testimonialId').value = t ? t.id : '';
  document.getElementById('testimonialName').value = t ? t.customer_name : '';
  document.getElementById('testimonialQuote').value = t ? t.quote : '';
  document.getElementById('testimonialRating').value = t ? t.rating : 5;
  document.getElementById('testimonialPublished').checked = t ? t.is_published : true;
  document.getElementById('testimonialFormMsg').style.display = 'none';
  document.getElementById('testimonialModalOverlay').classList.add('open');
}

function bindTestimonialModal() {
  const overlay = document.getElementById('testimonialModalOverlay');
  const close = () => overlay.classList.remove('open');
  document.getElementById('addTestimonialBtn').addEventListener('click', () => openTestimonialModal());
  document.getElementById('testimonialModalClose').addEventListener('click', close);
  document.getElementById('cancelTestimonialBtn').addEventListener('click', close);
  document.getElementById('testimonialForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('testimonialId').value;
    const payload = {
      customer_name: document.getElementById('testimonialName').value,
      quote: document.getElementById('testimonialQuote').value,
      rating: Number(document.getElementById('testimonialRating').value),
      is_published: document.getElementById('testimonialPublished').checked
    };
    try {
      if (id) await API.put(`/api/testimonials/${id}`, payload);
      else await API.post('/api/testimonials', payload);
      close();
      loadTestimonials();
    } catch (err) {
      setFormMessage(document.getElementById('testimonialFormMsg'), err.message, 'error');
    }
  });
}

// ---------- Wiring ----------
document.addEventListener('click', async (e) => {
  const sub = e.target.closest('[data-sub-action]');
  if (sub) return subscriberAction(sub.dataset.subAction, Number(sub.dataset.id));
  const camp = e.target.closest('[data-camp-action]');
  if (camp) return campaignAction(camp.dataset.campAction, Number(camp.dataset.id));
  const pager = e.target.closest('[data-pager]');
  if (pager) {
    if (pager.dataset.pager === 'subscribers') { subscriberFilter.page = Number(pager.dataset.page); fetchSubscribers(); }
    if (pager.dataset.pager === 'logs') { logPage = Number(pager.dataset.page); loadLogs(); }
    if (pager.dataset.pager === 'products') { productFilter.page = Number(pager.dataset.page); loadProducts(); }
    return;
  }
  const testi = e.target.closest('[data-testi-action]');
  if (testi) {
    const id = Number(testi.dataset.id);
    if (testi.dataset.testiAction === 'edit') openTestimonialModal(allTestimonials.find((t) => t.id === id));
    if (testi.dataset.testiAction === 'delete' && confirm('Delete this testimonial?')) {
      try { await API.del(`/api/testimonials/${id}`); loadTestimonials(); } catch (err) { alert(err.message); }
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  bindCampaignModal();
  bindTestimonialModal();

  let searchTimer;
  document.getElementById('subscriberSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { subscriberFilter.q = e.target.value.trim(); subscriberFilter.page = 1; fetchSubscribers(); }, 300);
  });
  document.getElementById('subscriberStatus').addEventListener('change', (e) => {
    subscriberFilter.status = e.target.value;
    subscriberFilter.page = 1;
    fetchSubscribers();
  });
  document.getElementById('confirmAllBtn').addEventListener('click', async (e) => {
    if (!confirm('Email a confirmation link to everyone still pending? Only those who click it will receive campaigns.')) return;
    e.target.disabled = true;
    try {
      alert((await API.post('/api/admin/email/subscribers/confirm-all-pending', {})).message);
      loadSubscribers();
    } catch (err) { alert(err.message); } finally { e.target.disabled = false; }
  });
});
