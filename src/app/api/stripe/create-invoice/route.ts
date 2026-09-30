import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export async function POST(req: Request) {
  try {
    const stripe = getStripe();
    const body = await req.json();
    const { stripeCustomerId, items = [], daysUntilDue = 7 } = body;

    if (!stripeCustomerId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'stripeCustomerId and items are required' },
        { status: 400 }
      );
    }

    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        amount: item.amountCents,
        currency: 'usd',
        description: item.description
      });
    }

    const invoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      collection_method: 'send_invoice',
      days_until_due: daysUntilDue,
      auto_advance: true
    });

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);

    return NextResponse.json({
      id: finalized.id,
      hostedInvoiceUrl: finalized.hosted_invoice_url,
      status: finalized.status
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create invoice';
    const status = message.includes('STRIPE_SECRET_KEY') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
