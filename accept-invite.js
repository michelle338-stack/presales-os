import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { sendError } from './_lib/respond.js';

// Called right after supabase.auth.signUp() succeeds on the frontend.
// The new user already has a valid session (passed as Authorization: Bearer <token>) —
// this route just resolves which company they belong to via the invite code and
// creates their profiles row. Without this, the account exists in auth.users but
// has no company_id, so every other route (requireAuth) would reject it.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) { const err = new Error('Missing session'); err.status = 401; throw err; }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) { const err = new Error('Invalid session'); err.status = 401; throw err; }

    const { code } = req.body;
    if (!code) { const err = new Error('Invite code is required'); err.status = 400; throw err; }

    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from('invite_codes')
      .select('code, company_id, used')
      .eq('code', code.trim())
      .single();

    if (inviteErr || !invite) { const err = new Error('Invalid invite code'); err.status = 404; throw err; }
    if (invite.used) { const err = new Error('This invite code has already been used'); err.status = 409; throw err; }

    // Prevent double-signup if a profile already exists for this user
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles').select('id').eq('id', userData.user.id).maybeSingle();
    if (existingProfile) { const err = new Error('This account is already linked to a company'); err.status = 409; throw err; }

    const { error: profileErr } = await supabaseAdmin.from('profiles').insert({
      id: userData.user.id, company_id: invite.company_id, email: userData.user.email
    });
    if (profileErr) throw profileErr;

    await supabaseAdmin.from('invite_codes')
      .update({ used: true, used_by: userData.user.id })
      .eq('code', invite.code);

    res.status(200).json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
}
