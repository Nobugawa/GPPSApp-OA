-- GPPS Contractor App / commercial-ready foundation
-- Canonical schema for the live Supabase project.
create extension if not exists pgcrypto;

do $$ begin
  create type public.member_role as enum ('owner','admin','office','field_tech','subcontractor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.component_type as enum ('labor','part','material','other');
exception when duplicate_object then null; end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'field_tech',
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create schema if not exists private;

create or replace function private.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id=org and m.user_id=auth.uid()
  );
$$;

create or replace function private.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id=org and m.user_id=auth.uid()
      and m.role in ('owner','admin')
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.is_org_admin(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text,last_name text,company_name text,email text,phone text,
  stripe_customer_id text,notes text,source text,source_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_users (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(customer_id,user_id)
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text,address1 text not null,address2 text,city text,state text,postal_code text,
  latitude numeric(9,6),longitude numeric(9,6),notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  property_id uuid references public.properties(id),
  title text not null,scope text,
  status text not null default 'lead' check(status in
    ('lead','estimate','approved','scheduled','en_route','arrived','in_progress','complete','cancelled')),
  assigned_user_id uuid references auth.users(id),
  scheduled_for timestamptz,completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  assigned_user_id uuid references auth.users(id),
  starts_at timestamptz not null,ends_at timestamptz,
  status text not null default 'scheduled' check(status in
    ('scheduled','confirmed','en_route','late','arrived','complete','cancelled')),
  customer_visible boolean not null default true,
  notes text,created_at timestamptz not null default now()
);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  event_type text not null,message text,
  customer_visible boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type public.component_type not null,
  canonical_name text not null,normalized_name text not null,
  category text,subcategory text,brand text,part_number text,sku text,upc text,gtin text,
  unit text default 'each',default_cost numeric(12,2),default_sell_price numeric(12,2),
  default_labor_hours numeric(8,2),vendor text,supplier_url text,notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id,normalized_name,type)
);

create table if not exists public.component_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  component_id uuid not null references public.components(id) on delete cascade,
  alias text not null,normalized_alias text not null,
  created_at timestamptz not null default now(),
  unique(organization_id,normalized_alias)
);

create table if not exists public.assemblies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,description text,
  created_at timestamptz not null default now(),
  unique(organization_id,name)
);

create table if not exists public.assembly_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assembly_id uuid not null references public.assemblies(id) on delete cascade,
  component_id uuid not null references public.components(id),
  quantity numeric(10,2) not null default 1,
  optional boolean not null default false,
  sort_order int not null default 0
);

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  estimate_number text,
  status text not null default 'draft' check(status in ('draft','sent','viewed','approved','declined','expired')),
  customer_message text,subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,total numeric(12,2) not null default 0,
  valid_until date,approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  component_id uuid references public.components(id),
  item_type public.component_type not null,
  internal_description text,customer_description text,
  quantity numeric(10,2) not null default 1,
  unit_cost numeric(12,2),unit_price numeric(12,2) not null default 0,
  sort_order int not null default 0
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id),
  estimate_id uuid references public.estimates(id),
  invoice_number text,status text not null default 'draft',
  stripe_invoice_id text unique,stripe_status text,hosted_invoice_url text,
  subtotal numeric(12,2) not null default 0,tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,due_at timestamptz,paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  component_id uuid references public.components(id),
  item_type public.component_type not null,
  internal_description text,customer_description text,
  quantity numeric(10,2) not null default 1,
  unit_cost numeric(12,2),unit_price numeric(12,2) not null default 0,
  sort_order int not null default 0
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  stripe_payment_intent_id text,amount numeric(12,2) not null,status text not null,
  paid_at timestamptz,created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  vendor text,purchased_at timestamptz,subtotal numeric(12,2),tax numeric(12,2),
  total numeric(12,2),notes text,source text,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete cascade,
  expense_id uuid references public.expenses(id) on delete cascade,
  storage_provider text not null default 'supabase',
  bucket text,object_path text,external_url text,filename text not null,mime_type text,byte_size bigint,
  attachment_type text,customer_visible boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.external_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,entity_id uuid not null,provider text not null,external_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(organization_id,entity_type,entity_id,provider)
);

create index if not exists components_search_idx on public.components using gin(
  to_tsvector('english',canonical_name||' '||coalesce(brand,'')||' '||coalesce(part_number,'')||' '||coalesce(sku,'')||' '||coalesce(upc,''))
);
create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists customers_org_idx on public.customers(organization_id);
create index if not exists customer_users_org_idx on public.customer_users(organization_id);
create index if not exists customer_users_user_idx on public.customer_users(user_id);
create index if not exists properties_org_idx on public.properties(organization_id);
create index if not exists properties_customer_idx on public.properties(customer_id);
create index if not exists jobs_org_idx on public.jobs(organization_id);
create index if not exists jobs_customer_idx on public.jobs(customer_id);
create index if not exists jobs_property_idx on public.jobs(property_id);
create index if not exists jobs_assigned_user_idx on public.jobs(assigned_user_id);
create index if not exists appointments_org_idx on public.appointments(organization_id);
create index if not exists appointments_job_idx on public.appointments(job_id);
create index if not exists appointments_assigned_user_idx on public.appointments(assigned_user_id);
create index if not exists job_events_org_idx on public.job_events(organization_id);
create index if not exists job_events_job_idx on public.job_events(job_id);
create index if not exists job_events_actor_user_idx on public.job_events(actor_user_id);
create index if not exists component_aliases_component_idx on public.component_aliases(component_id);
create index if not exists assembly_items_org_idx on public.assembly_items(organization_id);
create index if not exists assembly_items_assembly_idx on public.assembly_items(assembly_id);
create index if not exists assembly_items_component_idx on public.assembly_items(component_id);
create index if not exists estimates_org_idx on public.estimates(organization_id);
create index if not exists estimates_job_idx on public.estimates(job_id);
create index if not exists estimate_items_org_idx on public.estimate_items(organization_id);
create index if not exists estimate_items_estimate_idx on public.estimate_items(estimate_id);
create index if not exists estimate_items_component_idx on public.estimate_items(component_id);
create index if not exists invoices_org_idx on public.invoices(organization_id);
create index if not exists invoices_job_idx on public.invoices(job_id);
create index if not exists invoices_estimate_idx on public.invoices(estimate_id);
create index if not exists invoice_items_org_idx on public.invoice_items(organization_id);
create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index if not exists invoice_items_component_idx on public.invoice_items(component_id);
create index if not exists payments_org_idx on public.payments(organization_id);
create index if not exists payments_invoice_idx on public.payments(invoice_id);
create index if not exists expenses_org_idx on public.expenses(organization_id);
create index if not exists expenses_job_idx on public.expenses(job_id);
create index if not exists attachments_org_idx on public.attachments(organization_id);
create index if not exists attachments_customer_idx on public.attachments(customer_id);
create index if not exists attachments_job_idx on public.attachments(job_id);
create index if not exists attachments_estimate_idx on public.attachments(estimate_id);
create index if not exists attachments_invoice_idx on public.attachments(invoice_id);
create index if not exists attachments_expense_idx on public.attachments(expense_id);

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','organization_members','customers','customer_users','properties','jobs',
    'appointments','job_events','components','component_aliases','assemblies','assembly_items',
    'estimates','estimate_items','invoices','invoice_items','payments','expenses','attachments','external_references'
  ]
  loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;

drop policy if exists org_read on public.organizations;
create policy org_read on public.organizations for select to authenticated using(private.is_org_member(id));
drop policy if exists org_admin_update on public.organizations;
create policy org_admin_update on public.organizations for update to authenticated
using(private.is_org_admin(id)) with check(private.is_org_admin(id));

drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members for select to authenticated
using(user_id=(select auth.uid()) or private.is_org_admin(organization_id));
drop policy if exists members_insert on public.organization_members;
create policy members_insert on public.organization_members for insert to authenticated
with check(private.is_org_admin(organization_id));
drop policy if exists members_update on public.organization_members;
create policy members_update on public.organization_members for update to authenticated
using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id));
drop policy if exists members_delete on public.organization_members;
create policy members_delete on public.organization_members for delete to authenticated
using(private.is_org_admin(organization_id));

drop policy if exists customer_users_select on public.customer_users;
create policy customer_users_select on public.customer_users for select to authenticated
using(private.is_org_admin(organization_id) or user_id=(select auth.uid()));
drop policy if exists customer_users_insert on public.customer_users;
create policy customer_users_insert on public.customer_users for insert to authenticated
with check(private.is_org_admin(organization_id));
drop policy if exists customer_users_update on public.customer_users;
create policy customer_users_update on public.customer_users for update to authenticated
using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id));
drop policy if exists customer_users_delete on public.customer_users;
create policy customer_users_delete on public.customer_users for delete to authenticated
using(private.is_org_admin(organization_id));

do $$
declare t text;
begin
  foreach t in array array[
    'customers','properties','jobs','appointments','job_events','components','component_aliases',
    'assemblies','assembly_items','estimates','estimate_items','invoices','invoice_items',
    'payments','expenses','attachments','external_references'
  ]
  loop
    execute format('drop policy if exists %I_org_all on public.%I',t,t);
    execute format('create policy %I_org_all on public.%I for all to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id))',t,t);
  end loop;
end $$;

insert into public.organizations(name,slug)
values('Great Precision Property Services','gpps')
on conflict(slug) do nothing;
