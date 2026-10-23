# GPPS App — Product & Architecture Outline

_Last updated: 2026-10-23_

## 1. Product thesis

Build a contractor-first field-service operating system that turns real-world scope into structured jobs, estimates, invoices, payments, and reusable knowledge.

The product is broader than “handyman software.” It should work for residential and commercial field-service businesses including contractors, plumbers, painters, remodelers, facilities providers, and other trades.

Core principle:

> AI proposes. The database enforces structure. The contractor approves.

## 2. V1 operating loop

Customer → Property → Job → Estimate → Labor / Parts / Materials → Invoice → Payment

A feature enters V1 only if it materially helps create, price, perform, invoice, or get paid for a job.

## 3. Commercial architecture

- Multi-tenant from day one.
- Business records keyed by `organization_id`.
- Row Level Security (RLS) isolates organizations.
- Stable IDs and auditable relationships.
- Platform administration is separate from tenant administration.
- GPPS is the first tenant, not the product identity.

### Platform roles

- Platform super admin — Grey Matter Fusion / product operator.
- Support admin — future limited support role.

### Organization roles

- Owner
- Admin
- Office
- Field technician
- Subcontractor

Customer portal access is separate and limited to explicitly customer-visible records.

## 4. Customer model

A customer must be valid with **phone only**. Email is optional.

Customers can have:
- multiple properties
- multiple jobs
- phone
- email
- company name
- notes
- source / legacy IDs
- future portal login linkage

This is important because many contractors transact primarily by phone/SMS.

## 5. Jobs

Each job is the operating container for:
- customer
- property
- scope
- status
- appointments
- technician assignment
- photos/documents
- estimate(s)
- invoice(s)
- payment history
- activity/events
- customer-visible updates

Future statuses include:
- lead
- estimate
- approved
- scheduled
- en route
- arrived
- in progress
- complete
- cancelled

## 6. Canonical job component library

Reusable canonical records:
- Labor
- Parts
- Materials
- Other
- Assemblies / task packages

Goals:
- eliminate duplicate catalog items
- retain internal cost separately from customer price
- search by name, alias, SKU, UPC, part number, brand, vendor
- AI suggests existing matches before a new record is created

### Labor modes

- Owner labor
- Employee labor
- Subcontract labor

Owner labor does not require an artificial internal labor cost. Optional economic-cost analysis can exist later.

## 7. Estimate builder

Estimates should support:
- labor / parts / materials separation
- reusable assemblies
- internal cost
- customer sell price
- markup
- customer-facing descriptions
- internal descriptions
- photos
- dimensions
- dictated scope
- optional AI-assisted estimating

Internal profitability must never leak into customer-facing estimates.

## 8. AI-assisted estimator

Near-roadmap differentiator.

Inputs can include:
- project photos
- dimensions
- dictated or typed scope
- surface/material condition
- access difficulty
- company pricing history
- existing component library

AI can propose:
- scope
- labor hours
- parts
- materials
- quantities
- assemblies
- price range
- uncertainty flags

Contractor reviews and approves all proposed scope and pricing.

Initial real-world pilot candidate:
- deck cleaning
- sanding
- staining
- dimensions + photos + condition

## 9. Estimate and invoice delivery

Customer-facing documents should not require email.

Every finalized estimate/invoice should have a secure shareable URL.

Delivery actions:
- Copy link
- Send by SMS
- Send by email
- Future: customer portal notification

### SMS architecture

Two layers:
1. **Copy link** — works immediately with any phone/SMS system.
2. **Send SMS from app** — later via an SMS provider/API.

SMS should include concise contractor-branded wording and a secure URL.

For Stripe-backed invoices, Stripe provides a `hosted_invoice_url` after invoice finalization, which can be sent by SMS or another channel.

## 10. Invoices and Stripe

GPPS App is the business system of record.

Stripe is the payment/invoice collection engine.

Flow:
1. GPPS App creates invoice.
2. App calls Stripe API.
3. Stripe creates/finalizes invoice.
4. Stripe returns hosted invoice URL.
5. App can email it, SMS it, or copy the URL.
6. Stripe webhook reports payment state back to GPPS App.

The contractor should not have to recreate an invoice manually in Stripe.

## 11. Contractor-friendly branding policy

Customer-facing estimates, invoices, payment messages, and portal pages should be contractor-branded by default.

Do **not** make “remove our branding” a premium upsell.

Product-branding philosophy:
- Contractor/customer relationship comes first.
- Trial/evaluation users still receive professional contractor-facing output.
- Small unobtrusive “Powered by” attribution may be considered only if genuinely useful and non-disruptive, but removal should not be used as a pricing lever.

## 12. Evaluation / trial philosophy

Preferred model:
- 60-day evaluation
- 50% of normal price
- full product, not crippleware
- no automatic conversion to full-price billing
- no mandatory setup/training fee
- easy data export
- common export formats
- customer actively chooses to continue

Principle:

> Make it easy to come in, easy to understand, and easy to leave. The product earns retention rather than enforcing it.

## 13. Authentication

Current pilot:
- email + password
- show/hide password toggle

Future:
- passkeys
- email fallback
- stronger admin recovery options

Do not enable production passkeys until the permanent product domain is chosen because passkeys are tied to the relying-party domain.

## 14. Customer portal — later

Future portal can expose:
- estimates
- approve / decline
- appointments
- en route / late / arrived / complete updates
- invoices
- payment history
- customer-visible photos/documents
- messaging thread

Portal must be a view into the same underlying job data, not a separate parallel database.

## 15. Communication

Future communications should be channel-neutral.

Possible channels:
- SMS
- email
- in-app / portal
- copyable links

We should not assume every customer has email.

Activity/event records should log important communications so history does not disappear into unstructured notes.

## 16. Attachments and storage

Attachments can belong to:
- customers
- jobs
- estimates
- invoices
- expenses

Types can include:
- job photos
- receipts
- PDFs
- signed documents
- before/after images

The database stores what the object is and what business record it belongs to. A storage abstraction controls where bytes live.

Primary live storage can begin with Supabase Storage; independent backup/archive can use Backblaze B2 later.

## 17. Backups and durability

Layers:
1. GitHub — source/schema/migrations
2. Supabase — live operational database/auth/storage + provider recovery
3. Independent backup — database exports + storage copies to Backblaze B2

Independent backup becomes high priority before substantial live customer/invoice data accumulates.

## 18. Future integrations

Architecture should permit without pulling them into V1:
- QuickBooks
- receipt scanning
- UPC lookup
- GPS / routing
- historical quote-model learning
- payroll
- fleet
- financing
- call center
- inventory
- other integrations

Use external IDs and a general integration-reference layer rather than embedding every provider into core tables.

## 19. Shared GMF AI Service Layer

Long-term shared architecture across Grey Matter Fusion applications:

Applications:
- GPPS App
- Evernote replacement
- Scanner
- PBSO
- future satellite apps

Authenticated requests flow through:

**GMF AI Service Layer**
- model routing
- permissions
- usage/cost tracking
- prompt/version management
- vision
- language
- embeddings
- provider selection

Then to:
- Supabase / application data
- external AI APIs

API credentials stay server-side and out of users' browsers.

## 20. Current implementation status

- Dedicated Supabase project created.
- Multi-tenant schema established.
- RLS enabled.
- Platform-admin foundation created.
- Netlify connected to GitHub.
- Supabase public environment variables configured in Netlify.
- Mobile-first UI scaffold deployed.
- Auth flow added.
- Customer CRUD started.
- Job CRUD started.
- Stripe API route foundation exists.
- Passkeys intentionally deferred.
- Product/domain name not yet finalized.

## 21. Immediate next milestones

1. Complete first authenticated GPPS owner login.
2. Create first real customer.
3. Create first real job.
4. Build first real estimate.
5. Convert estimate to invoice.
6. Create/finalize Stripe invoice via API.
7. Store and expose hosted invoice URL.
8. Add Copy Link and SMS-ready delivery.
9. Use deck job as first photo/dimension AI-estimator pilot.
