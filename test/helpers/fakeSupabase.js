// test/helpers/fakeSupabase.js
// An in-memory stand-in for the parts of supabase-js this app uses, so tests and
// the preview server run the real controllers without touching the real database.

const COLUMN_DEFAULTS = {
  subscribers: () => ({
    status: 'pending',
    unsubscribe_token: require('crypto').randomBytes(32).toString('hex'),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }),
  email_logs: () => ({ status: 'queued', attempts: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  email_campaigns: () => ({ status: 'draft', recipient_count: 0, sent_count: 0, failed_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  product_clicks: () => ({ created_at: new Date().toISOString() }),
  testimonials: () => ({ is_published: true, created_at: new Date().toISOString() }),
  products: () => ({ date_added: new Date().toISOString(), is_verified: false, rating: null, rating_count: null, specifications: {}, images: [] })
};

const UNIQUE = {
  subscribers: [['email']],
  email_logs: [['campaign_id', 'subscriber_id']],
  categories: [['slug']],
  products: [['slug']]
};

function createFakeSupabase(seed = {}) {
  const tables = {};
  const ids = {};
  const buckets = new Set();
  const objects = new Map();
  const users = {};

  const table = (name) => (tables[name] = tables[name] || []);
  const insertRow = (name, row) => {
    ids[name] = (ids[name] || 0) + 1;
    const full = { id: ids[name], ...(COLUMN_DEFAULTS[name] ? COLUMN_DEFAULTS[name]() : {}), ...row };
    if (row.id !== undefined) ids[name] = Math.max(ids[name], row.id);
    table(name).push(full);
    return full;
  };
  const conflict = (name, row) => (UNIQUE[name] || []).some((cols) =>
    cols.every((c) => row[c] !== null && row[c] !== undefined) &&
    table(name).some((existing) => cols.every((c) => existing[c] === row[c])));

  Object.entries(seed).forEach(([name, rows]) => rows.forEach((r) => insertRow(name, r)));

  class Query {
    constructor(name) {
      Object.assign(this, { name, filters: [], action: 'select', columns: '*', opts: {}, sorts: [], shape: 'many' });
    }
    select(columns = '*', opts = {}) {
      if (this.action === 'select') { this.columns = columns; this.opts = opts; } else { this.returning = true; }
      return this;
    }
    insert(row) { this.action = 'insert'; this.payload = row; return this; }
    update(row) { this.action = 'update'; this.payload = row; return this; }
    delete() { this.action = 'delete'; return this; }
    eq(col, val) { this.filters.push((r) => get(this, r, col) == val); return this; } // eslint-disable-line eqeqeq
    neq(col, val) { this.filters.push((r) => get(this, r, col) != val); return this; } // eslint-disable-line eqeqeq
    gt(col, val) { this.filters.push((r) => r[col] > val); return this; }
    gte(col, val) { this.filters.push((r) => r[col] >= val); return this; }
    in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this; }
    ilike(col, pattern) { const re = likeRe(pattern); this.filters.push((r) => re.test(String(r[col] ?? ''))); return this; }
    or(expr) {
      const parts = expr.split(',').map((p) => { const [col, , ...rest] = p.split('.'); return [col, likeRe(rest.join('.'))]; });
      this.filters.push((r) => parts.some(([col, re]) => re.test(String(r[col] ?? ''))));
      return this;
    }
    order(col, { ascending = true } = {}) { this.sorts.push([col, ascending]); return this; }
    range(from, to) { this.window = [from, to + 1]; return this; }
    limit(n) { this.window = [0, n]; return this; }
    single() { this.shape = 'one'; return this; }
    maybeSingle() { this.shape = 'maybe'; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject); }

    run() {
      if (createFakeSupabase.failTables && createFakeSupabase.failTables.has(this.name)) {
        return { data: null, error: { message: `${this.name} is unavailable` }, count: null };
      }
      if (this.action === 'insert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        for (const row of rows) {
          if (conflict(this.name, row)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        return this.finish(rows.map((row) => insertRow(this.name, clone(row))));
      }
      const matched = table(this.name).filter((r) => this.filters.every((f) => f(r)));
      if (this.action === 'update') {
        matched.forEach((r) => Object.assign(r, clone(this.payload)));
        return this.finish(matched);
      }
      if (this.action === 'delete') {
        tables[this.name] = table(this.name).filter((r) => !matched.includes(r));
        return { data: matched, error: null };
      }
      let rows = [...matched];
      this.sorts.slice().reverse().forEach(([col, asc]) => rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1)));
      const count = rows.length;
      if (this.window) rows = rows.slice(...this.window);
      if (this.opts.head) return { data: null, error: null, count };
      return this.finish(rows, count);
    }

    finish(rows, count = null) {
      const out = rows.map((r) => project(withCategory(clone(r), this.columns), this.columns));
      if (this.shape === 'one') return out.length ? { data: out[0], error: null, count } : { data: null, error: { message: 'no rows' }, count };
      if (this.shape === 'maybe') return { data: out[0] || null, error: null, count };
      return { data: out, error: null, count };
    }
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));
  function get(query, row, col) {
    if (col === 'category.slug') {
      const c = table('categories').find((x) => x.id === row.category_id);
      return c && c.slug;
    }
    return row[col];
  }
  function likeRe(pattern) {
    const literal = (ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const source = pattern.replace(/\\([%_\\])|%|_|[\s\S]/g, (token, escaped) => {
      if (escaped) return literal(escaped);
      if (token === '%') return '.*';
      if (token === '_') return '.';
      return literal(token);
    });
    return new RegExp(`^${source}$`, 'i');
  }
  function withCategory(row, columns) {
    if (typeof columns === 'string' && columns.includes('category:')) {
      const c = table('categories').find((x) => x.id === row.category_id);
      row.category = c ? { name: c.name, slug: c.slug } : null;
    }
    return row;
  }

  // Like the real client, only the listed columns come back
  function project(row, columns) {
    if (typeof columns !== 'string' || columns.includes('*')) return row;
    const names = columns.split(',').map((c) => c.trim());
    return Object.fromEntries(Object.entries(row).filter(([k]) => names.includes(k) || k === 'category'));
  }

  const client = {
    from: (name) => new Query(name),
    storage: {
      getBucket: async (name) => ({ data: buckets.has(name) ? { name } : null, error: null }),
      createBucket: async (name) => { buckets.add(name); return { data: { name }, error: null }; },
      from: (bucket) => ({
        upload: async (path, body, options) => { objects.set(`${bucket}/${path}`, { body, options }); return { data: { path }, error: null }; },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.test/storage/v1/object/public/${bucket}/${path}` } }),
        remove: async (paths) => { paths.forEach((p) => objects.delete(`${bucket}/${p}`)); return { data: paths, error: null }; }
      })
    },
    auth: {
      getUser: async (token) => (users[token] ? { data: { user: users[token] }, error: null } : { data: null, error: { message: 'invalid token' } }),
      signInWithPassword: async () => ({ data: null, error: { message: 'not supported' } }),
      admin: { signOut: async () => ({}) }
    }
  };

  return { supabase: client, supabaseAdmin: client, tables, table, objects, users };
}

module.exports = { createFakeSupabase };
