import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export async function POST(req: Request) {
  try {
    const stripe = getStripe();
    const body = await req.json();
    const {
      stripeCustomerId,
      customerName,
      customerEmail,
      items = [],
      daysUntilDue = 7
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'At least one invoice item is required.' },
        { status: 400 }
      );
    }

    let customerId = stripeCustomerId as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: customerName || undefined,
        email: customerEmail || undefined
      });
      customerId = customer.id;
    }

    for (const item of items) {
      const amountCents = Number(item.amountCents);
      if (!Number.isFinite(amountCents) || amountCents < 0) {
        return NextResponse.json(
          { error: 'Invoice item amount is invalid.' },
          { status: 400 }
        );
      }

      await stripe.invoiceItems.create({
        customer: customerId,
        amount: Math.round(amountCents),
        currency: 'usd',
        description: item.description || 'Service'
      });
    }

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: Number(daysUntilDue) || 7,
      auto_advance: false
    });

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);

    return NextResponse.json({
      id: finalized.id,
      stripeCustomerId: customerId,
      hostedInvoiceUrl: finalized.hosted_invoice_url,
      status: finalized.status,
      number: finalized.number
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create invoice';
    const status = message.includes('STRIPE_SECRET_KEY') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
