// config/supabase.js
// Sets up two Supabase clients:
//
//  - `supabase`      (anon key)    — used ONLY for auth.signInWithPassword()
//                                    and auth.getUser(), exactly like a
//                                    normal client-facing key would be.
//  - `supabaseAdmin` (service role key) — used for every product/category/
//                                    testimonial/contact/subscriber query,
//                                    and for creating the admin user in the
//                                    seed script. This key bypasses Row
//                                    Level Security, so it must NEVER be
//                                    sent to the browser — it only ever
//                                    lives here, on the server.
//
// Both keys come from your Supabase project settings:
// Dashboard → Project Settings → API.

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '⚠️  Supabase environment variables are missing. Set SUPABASE_URL, ' +
    'SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in your .env file ' +
    '(see .env.example) before starting the server.'
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = { supabase, supabaseAdmin };
