import crypto from 'crypto';
import { supabaseAdmin } from '../_lib/supabaseAdmin.js';

// Signature verification needs the raw request body (not Vercel's parsed JSON),
// so body parsing is disabled for this route.
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// Whop signs webhooks using the Standard Webhooks scheme:
// signature = base64(HMAC-SHA256(secret, "{id}.{timestamp}.{body}"))
function verifySignature(rawBody, headers) {
  const secret = process.env.WHOP_WEBHOOK_SECRET; // format: whsec_xxxxx
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature']; // "v1,<base64> v1,<base64>..."
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const secretBytes = Buffer.from(secret.split('_')[1] || secret, 'base64');
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  return signatureHeader.split(' ').some(sig => {
    const [, value] = sig.split(',');
    if (!value) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
    } catch { return false; }
  });
}

// Maps Whop event types to the subscription status stored in Supabase.
// This IS the kill switch — requireActiveSubscription() reads what this writes.
const STATUS_MAP = {
  'membership.activated': 'active',
  'membership.deactivated': 'canceled',
  'invoice.paid': 'active',
  'invoice.past_due': 'past_due'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);

  if (!verifySignature(rawBody, req.headers)) {
    console.warn('[WHOP WEBHOOK] Invalid signature — request rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody);
  const newStatus = STATUS_MAP[event.type];

  if (!newStatus) {
    // Event we don't act on (e.g. product.updated) — acknowledge so Whop doesn't retry
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const whopMembershipId = event.data?.id;

  try {
    const { data: existing } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('whop_membership_id', whopMembershipId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.from('subscriptions').update({
        status: newStatus,
        current_period_end: event.data?.renewal_period_end || null,
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
    } else {
      // First event ever received for this membership_id — attach it to Majan's row.
      // V1 has a single client, so this is a direct match. A future multi-client version
      // needs the checkout to pass company_id as metadata instead of this fallback.
      const { data: majan } = await supabaseAdmin
        .from('companies').select('id').eq('name', 'Majan Technology Solutions').single();

      if (majan) {
        await supabaseAdmin.from('subscriptions').update({
          whop_membership_id: whopMembershipId,
          status: newStatus,
          current_period_end: event.data?.renewal_period_end || null,
          updated_at: new Date().toISOString()
        }).eq('company_id', majan.id);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[WHOP WEBHOOK] DB update failed:', err.message);
    res.status(500).json({ error: 'Internal error processing webhook' });
  }
}
