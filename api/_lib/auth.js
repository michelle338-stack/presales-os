import { supabaseAdmin } from './supabaseAdmin.js';

// Verifies the Supabase session JWT sent by the frontend (Authorization: Bearer <token>)
// and resolves which company the caller belongs to via the profiles table.
// Every data-touching route calls this first — it is the login gate.
export async function requireAuth(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    const err = new Error('Missing or invalid Authorization header');
    err.status = 401;
    throw err;
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    const err = new Error('Invalid or expired session — please log in again');
    err.status = 401;
    throw err;
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('id, company_id, email')
    .eq('id', userData.user.id)
    .single();

  if (profileErr || !profile) {
    const err = new Error('This account is not linked to a company yet. Contact your administrator.');
    err.status = 403;
    throw err;
  }

  return { userId: profile.id, companyId: profile.company_id, email: profile.email };
}
