import { requireAuth } from './_lib/auth.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { sendError } from './_lib/respond.js';

// Read-only status check for the UI (trial gauge, billing banners) — does NOT
// gate anything itself. The real kill switch is requireActiveSubscription(),
// called separately by every AI-calling route.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { companyId } = await requireAuth(req);
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('company_id', companyId)
      .single();
    if (error || !data) { const err = new Error('No subscription found'); err.status = 404; throw err; }
    res.status(200).json({ status: data.status, currentPeriodEnd: data.current_period_end });
  } catch (err) {
    sendError(res, err);
  }
}
