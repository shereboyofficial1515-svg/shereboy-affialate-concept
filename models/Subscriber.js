// models/Subscriber.js
// Data access for newsletter subscribers (service role only: RLS blocks everyone else).

const { supabaseAdmin } = require('../config/supabase');

const STATUSES = ['pending', 'confirmed', 'unsubscribed', 'bounced', 'complained'];
// Only what the admin dashboard shows: tokens never leave the server
const ADMIN_COLUMNS = 'id, email, status, source, created_at, confirmed_at, confirm_sent_at, unsubscribed_at';

function throwIfError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

const Subscriber = {
  STATUSES,

  async findByEmail(email) {
    const { data, error } = await supabaseAdmin.from('subscribers').select('*').eq('email', email).maybeSingle();
    throwIfError(error, 'Failed to look up subscriber');
    return data;
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin.from('subscribers').select('*').eq('id', id).maybeSingle();
    throwIfError(error, 'Failed to load subscriber');
    return data;
  },

  async findByConfirmHash(hash) {
    const { data, error } = await supabaseAdmin.from('subscribers').select('*').eq('confirm_token_hash', hash).maybeSingle();
    throwIfError(error, 'Failed to look up subscriber');
    return data;
  },

  async findByUnsubscribeToken(token) {
    const { data, error } = await supabaseAdmin.from('subscribers').select('*').eq('unsubscribe_token', token).maybeSingle();
    throwIfError(error, 'Failed to look up subscriber');
    return data;
  },

  /** Returns the new row, or null when the address is already in the table (race-safe). */
  async create(fields) {
    const { data, error } = await supabaseAdmin.from('subscribers').insert(fields).select('*').single();
    if (error && error.code === '23505') return null;
    throwIfError(error, 'Failed to save subscriber');
    return data;
  },

  async update(id, fields) {
    const { data, error } = await supabaseAdmin
      .from('subscribers')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    throwIfError(error, 'Failed to update subscriber');
    return data;
  },

  async remove(id) {
    const { error } = await supabaseAdmin.from('subscribers').delete().eq('id', id);
    throwIfError(error, 'Failed to delete subscriber');
  },

  async list({ q, status, page = 1, perPage = 25 }) {
    let query = supabaseAdmin.from('subscribers').select(ADMIN_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    if (q) query = query.ilike('email', `%${q.replace(/[%_\\]/g, '\\$&')}%`);
    const from = (page - 1) * perPage;
    const { data, error, count } = await query.range(from, from + perPage - 1);
    throwIfError(error, 'Failed to list subscribers');
    return { subscribers: data || [], total: count || 0, page, totalPages: Math.max(1, Math.ceil((count || 0) / perPage)) };
  },

  async counts() {
    const entries = await Promise.all(STATUSES.map(async (status) => {
      const { count, error } = await supabaseAdmin.from('subscribers').select('id', { count: 'exact', head: true }).eq('status', status);
      throwIfError(error, 'Failed to count subscribers');
      return [status, count || 0];
    }));
    return Object.fromEntries(entries);
  },

  /** A page of subscribers in one status, in a stable order, for bulk sending. */
  async pageByStatus(status, afterId, limit = 200) {
    const { data, error } = await supabaseAdmin
      .from('subscribers').select('*').eq('status', status).gt('id', afterId)
      .order('id', { ascending: true }).limit(limit);
    throwIfError(error, 'Failed to load subscribers');
    return data || [];
  }
};

module.exports = Subscriber;
