import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getStripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
  const raw = await req.text();
  const h = await headers();
  const sig = h.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET is not configured.' },
      { status: 503 }
    );
  }

  let event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch {
    return NextResponse.json(
      { error: 'Invalid webhook signature or Stripe is not configured.' },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  if (
    event.type === 'invoice.paid' ||
    event.type === 'invoice.payment_failed' ||
    event.type === 'invoice.voided'
  ) {
    const invoice: any = event.data.object;

    await db
      .from('invoices')
      .update({
        status: invoice.status,
        stripe_status: invoice.status,
        paid_at: invoice.status === 'paid' ? new Date().toISOString() : null
      })
      .eq('stripe_invoice_id', invoice.id);
  }

  return NextResponse.json({ received: true });
}
