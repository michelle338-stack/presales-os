import { supabaseAdmin } from './supabaseAdmin.js';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

// Public checkout link — safe to hardcode, it's a payment page URL, not a secret.
export const WHOP_PAYMENT_URL = 'https://whop.com/novark-ai-agency/presales-os-majan-technology-solutions/';

// Blocks access if the company's Whop subscription isn't active — including a trial
// that has run past its 7-day window. Reads from Supabase (kept in sync by the Whop
// webhook), not from Whop directly — faster, and doesn't depend on Whop's API being
// reachable on every single request.
export async function requireActiveSubscription(companyId) {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('id, status, current_period_end')
    .eq('company_id', companyId)
    .single();

  if (error || !data) {
    const err = new Error('No subscription found for this company');
    err.status = 402; err.whopUrl = WHOP_PAYMENT_URL;
    throw err;
  }

  if (data.status === 'trialing' && data.current_period_end) {
    const expired = new Date(data.current_period_end).getTime() < Date.now();
    if (expired) {
      // Flip it once so we don't recompute this on every request going forward
      await supabaseAdmin.from('subscriptions').update({ status: 'trial_expired' }).eq('id', data.id);
      const err = new Error('Your 7-day free trial has ended. Subscribe to keep using Presales OS.');
      err.status = 402; err.whopUrl = WHOP_PAYMENT_URL;
      throw err;
    }
    return data; // still within trial window
  }

  if (!ACTIVE_STATUSES.has(data.status)) {
    const label = data.status === 'trial_expired' ? 'Your free trial has ended.' : `Subscription is ${data.status}.`;
    const err = new Error(`${label} Subscribe to continue using Presales OS.`);
    err.status = 402; err.whopUrl = WHOP_PAYMENT_URL;
    throw err;
  }

  return data;
}
