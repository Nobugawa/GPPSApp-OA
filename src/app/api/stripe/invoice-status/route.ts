import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export async function GET(req: Request) {
  try {
    const stripe = getStripe();
    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get('invoiceId');

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
    }

    const invoice = await stripe.invoices.retrieve(invoiceId);

    return NextResponse.json({
      id: invoice.id,
      status: invoice.status,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      number: invoice.number,
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to retrieve invoice';
    const status = message.includes('STRIPE_SECRET_KEY') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
