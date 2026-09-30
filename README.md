# Contractor MVP

Temporary project name. The product is intentionally narrow:

**Customer → Job → Estimate → Labor/Parts/Materials → Invoice → Stripe Payment**

## V1 product rules

1. No payroll, fleet/GPS, financing, call center, warehouse inventory, or integration sprawl.
2. Supabase is the system of record. Stripe is the payment/invoice processor.
3. Multi-tenant from day one via `organization_id`.
4. Labor, parts and materials are first-class types, not generic line items.
5. Canonical components prevent duplicate catalog garbage.
6. Assemblies package recurring work while allowing job-specific exceptions.
7. AI may suggest categories/matches, but does not silently create canonical records.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and add Supabase + Stripe credentials.
4. `npm install`
5. `npm run dev`
6. Configure a Stripe webhook pointing to `/api/stripe/webhook` for at least:
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.voided`

## Immediate build order

1. Authentication + organization bootstrap.
2. Customer/property CRUD.
3. Component Library with duplicate detection and canonical naming.
4. Assembly builder.
5. Job workspace.
6. Estimate builder with separate internal vs customer-facing descriptions.
7. Convert approved estimate to Stripe invoice.
8. Webhook-driven payment status.

## Core data idea

A component is a reusable canonical item such as:

- Labor: `Replace standard toilet`
- Part: `Fluidmaster 400A fill valve`
- Material: `100% silicone — white`

An assembly is a reusable task package such as `Replace standard toilet`, made from labor + parts + materials. The contractor can remove optional items or mark something customer-supplied on each job without altering the master assembly.
