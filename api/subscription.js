import { supabaseAdmin } from './supabaseAdmin.js';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

// Blocks access if the company's Whop subscription isn't active.
// This reads from Supabase (kept in sync by the Whop webhook), not from Whop directly —
// faster, and doesn't depend on Whop's API being reachable on every single request.
export async function requireActiveSubscription(companyId) {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('company_id', companyId)
    .single();

  if (error || !data) {
    const err = new Error('No subscription found for this company');
    err.status = 402;
    throw err;
  }

  if (!ACTIVE_STATUSES.has(data.status)) {
    const err = new Error(`Subscription is ${data.status}. Access suspended — contact Novark AI to renew.`);
    err.status = 402;
    throw err;
  }

  return data;
}
