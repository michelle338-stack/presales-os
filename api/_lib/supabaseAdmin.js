import { createClient } from '@supabase/supabase-js';

// Service-role client — bypasses RLS. Used ONLY server-side.
// Every route that uses this MUST manually scope queries by company_id
// (via requireAuth) since RLS is not enforced with this key.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
