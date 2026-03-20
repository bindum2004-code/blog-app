const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_ANON   = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_SERVICE) {
  console.error("❌  Missing Supabase env vars. Check your .env file.");
  process.exit(1);
}

// Public client — respects RLS (use for user-context operations)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false },
});

// Admin client — bypasses RLS (server-side only, NEVER expose to client)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Create a client that acts as a specific user (for RLS-aware server calls)
const supabaseAs = (accessToken) =>
  createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

module.exports = { supabase, supabaseAdmin, supabaseAs };
