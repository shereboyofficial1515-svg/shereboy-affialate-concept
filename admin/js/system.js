// admin/js/system.js
// Analytics, Admin Users with Roles & Permissions, Activity Logs, System Health.

const PERMISSION_LABELS = {
  'products.edit': 'Draft and edit products', 'products.publish': 'Publish products, manage categories', 'media.manage': 'Use the media library',
  'ai.use': 'Use AI writing tools', 'content.edit': 'Draft pages', 'content.publish': 'Publish pages, homepage, banners', 'email.manage': 'Subscribers, campaigns, messages',
  'settings.manage': 'Website settings', 'ai.manage': 'Configure AI', 'audit.view': 'View analytics and activity logs', 'system.view': 'View system health',
  'ai.keys': 'Manage AI API keys', 'users.manage': 'Manage admin users'
};

function systemFail(id, err) {
  document.getElementById(id).innerHTML = `<div class="panel">${emptyStateHTML(err.message, 'warning')}</div>`;
}

async function loadAnalyticsView() {
  const section = document.getElementById('view-analytics');
  try {
    const { clicks, products, subscribers, messagesLast30, days } = await API.get('/api/admin/analytics');
    const max = Math.max(1, ...clicks.perDay.map((d) => d.count));
    section.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><b>${clicks.total}</b><span>Clicks to retailers, last ${days} days</span></div>
        <div class="stat-card"><b>${products.published || 0}</b><span>Published products</span></div>
        <div class="stat-card"><b>${subscribers.confirmed}</b><span>Confirmed subscribers</span></div>
        <div class="stat-card"><b>${subscribers.newLast30}</b><span>New signups, last ${days} days</span></div>
        <div class="stat-card"><b>${messagesLast30}</b><span>Contact messages, last ${days} days</span></div>
      </div>
      <div class="panel"><h3 class="form-heading">Clicks to retailers per day</h3>
        <div class="day-chart" role="img" aria-label="Clicks per day for the last ${days} days">${clicks.perDay.map((d) => `<div class="day-bar" style="height:${Math.max(2, (d.count / max) * 100)}%" title="${escapeHtml(d.date)}: ${d.count}"></div>`).join('')}</div>
      </div>
      <div class="panel"><h3 class="form-heading">Most clicked products</h3>
        ${clicks.topProducts.length ? clicks.topProducts.map((p) => `<div class="list-row"><span>${escapeHtml(p.name)}</span><b>${p.count}</b></div>`).join('') : '<p class="muted-cell">No clicks recorded yet.</p>'}
      </div>
      <p class="muted-cell">Counts clicks on "View Deal" only. It doesn't track visitors, and sales happen on retailers' sites, so they aren't included.</p>`;
  } catch (err) { systemFail('view-analytics', err); }
}

async function loadUsersView() {
  const section = document.getElementById('view-users');
  try {
    const { owners, users, permissions } = await API.get('/api/admin/users');
    const roles = ['owner', 'admin', 'editor'];
    section.innerHTML = `
      <div class="panel-head"><h3>Admin users</h3><button type="button" class="btn btn-primary btn-sm" data-new>${icon('plus')} Add user</button></div>
      <div class="panel table-panel"><table><thead><tr><th>Email</th><th>Role</th><th>Actions</th></tr></thead><tbody>
        ${owners.map((email) => `<tr><td>${escapeHtml(email)}</td><td><span class="pill pill-gold">Owner</span></td><td class="muted-cell">Set by ADMIN_EMAILS on the server</td></tr>`).join('')}
        ${users.map((u) => `<tr><td>${escapeHtml(u.email)}</td><td><span class="pill pill-blue">${escapeHtml(u.role)}</span></td>
          <td class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="${escapeHtml(u.email)}" data-role="${escapeHtml(u.role)}">Change role</button><button class="btn btn-danger btn-sm" data-del="${escapeHtml(u.email)}">Remove</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="panel table-panel"><h3 class="form-heading" style="padding:16px 16px 0;">Roles &amp; permissions</h3><table><thead><tr><th>Permission</th>${roles.map((r) => `<th>${r}</th>`).join('')}</tr></thead><tbody>
        ${Object.entries(PERMISSION_LABELS).map(([key, label]) => `<tr><td>${escapeHtml(label)}</td>${roles.map((r) => `<td>${permissions[r].includes(key) ? icon('check') : ''}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;
    const open = (email, role) => openFormModal({
      title: email ? 'Change role' : 'Add user',
      fields: [
        { name: 'email', label: 'Email address', type: 'email' },
        { name: 'role', label: 'Role', type: 'select', options: [['editor', 'Editor'], ['admin', 'Admin']] },
        ...(email ? [] : [{ name: 'invite', label: 'Email an invitation to create an account', type: 'checkbox', help: 'Skip this if they already have a login for this site.' }])
      ],
      values: { email, role: role || 'editor', invite: true },
      onSave: async (v) => {
        toast((await API.put('/api/admin/users', v)).message);
        loadUsersView();
      }
    });
    section.onclick = async (e) => {
      if (e.target.closest('[data-new]')) return open();
      const edit = e.target.closest('[data-edit]');
      if (edit) return open(edit.dataset.edit, edit.dataset.role);
      const del = e.target.closest('[data-del]');
      if (del && confirm(`Remove dashboard access for ${del.dataset.del}?`)) {
        try {
          await API.del(`/api/admin/users/${encodeURIComponent(del.dataset.del)}`);
          loadUsersView();
        } catch (err) { toast(err.message, 'error'); }
      }
      return undefined;
    };
  } catch (err) { systemFail('view-users', err); }
}

let auditPage = 1;
async function loadAuditView() {
  const section = document.getElementById('view-audit');
  try {
    const { entries, page, totalPages } = await API.get(`/api/admin/audit?page=${auditPage}`);
    section.innerHTML = `<div class="panel table-panel"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>
      ${entries.length ? entries.map((l) => `<tr>
        <td class="muted-cell">${formatDateTime(l.created_at)}</td>
        <td>${escapeHtml(l.actor_email || '—')}</td>
        <td><code>${escapeHtml(l.action)}</code></td>
        <td>${escapeHtml([l.target_type, l.target_id].filter(Boolean).join(' '))}</td>
        <td class="muted-cell" style="max-width:280px;">${l.details ? escapeHtml(JSON.stringify(l.details)) : ''}</td></tr>`).join('') : emptyRow(5, 'No activity recorded yet.')}
    </tbody></table></div>
    ${totalPages > 1 ? `<div class="pager"><button class="btn btn-ghost btn-sm" data-go="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${totalPages}</span><button class="btn btn-ghost btn-sm" data-go="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next</button></div>` : ''}`;
    section.onclick = (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { auditPage = Number(go.dataset.go); loadAuditView(); }
    };
  } catch (err) { systemFail('view-audit', err); }
}

async function loadHealthView() {
  const section = document.getElementById('view-health');
  try {
    const { checks, runtime } = await API.get('/api/admin/health');
    section.innerHTML = `<div class="panel"><ul class="status-list">
      ${checks.map((c) => `<li class="${c.ok ? 'ok' : 'bad'}">${icon(c.ok ? 'check' : 'warning')} <span><b>${escapeHtml(c.name)}</b><br><span class="muted-cell">${escapeHtml(c.detail)}</span></span></li>`).join('')}
    </ul></div>
    <div class="panel"><h3 class="form-heading">Server</h3>
      <div class="list-row"><span>Node.js</span><span>${escapeHtml(runtime.node)}</span></div>
      <div class="list-row"><span>Running for</span><span>${Math.floor(runtime.uptimeSeconds / 3600)} h ${Math.floor((runtime.uptimeSeconds % 3600) / 60)} min</span></div>
      <div class="list-row"><span>Memory</span><span>${runtime.memoryMb} MB</span></div>
      <div class="list-row"><span>Environment</span><span>${escapeHtml(runtime.environment)}</span></div>
    </div>`;
  } catch (err) { systemFail('view-health', err); }
}
