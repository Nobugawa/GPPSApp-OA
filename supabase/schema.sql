create extension if not exists pgcrypto;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member')),
  primary key (organization_id, user_id)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  first_name text,
  last_name text,
  company_name text,
  email text,
  phone text,
  stripe_customer_id text,
  notes text,
  created_at timestamptz not null default now()
);

create table properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  label text,
  address1 text not null,
  address2 text,
  city text,
  state text,
  postal_code text,
  notes text,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id),
  property_id uuid references properties(id),
  title text not null,
  scope text,
  status text not null default 'lead' check (status in ('lead','estimate','approved','scheduled','in_progress','complete','cancelled')),
  scheduled_for timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create type component_type as enum ('labor','part','material','other');
create table components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type component_type not null,
  canonical_name text not null,
  normalized_name text not null,
  category text,
  subcategory text,
  brand text,
  part_number text,
  unit text default 'each',
  default_cost numeric(12,2),
  default_sell_price numeric(12,2),
  default_labor_hours numeric(8,2),
  vendor text,
  supplier_url text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, normalized_name, type)
);
create index components_search_idx on components using gin (to_tsvector('english', canonical_name || ' ' || coalesce(brand,'') || ' ' || coalesce(part_number,'')));

create table assemblies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table assembly_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  assembly_id uuid not null references assemblies(id) on delete cascade,
  component_id uuid not null references components(id),
  quantity numeric(10,2) not null default 1,
  optional boolean not null default false,
  sort_order int not null default 0
);

create table estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  estimate_number text,
  status text not null default 'draft' check (status in ('draft','sent','viewed','approved','declined','expired')),
  customer_message text,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table estimate_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  estimate_id uuid not null references estimates(id) on delete cascade,
  component_id uuid references components(id),
  item_type component_type not null,
  internal_description text,
  customer_description text,
  quantity numeric(10,2) not null default 1,
  unit_cost numeric(12,2),
  unit_price numeric(12,2) not null default 0,
  sort_order int not null default 0
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id),
  estimate_id uuid references estimates(id),
  invoice_number text,
  status text not null default 'draft',
  stripe_invoice_id text unique,
  stripe_status text,
  hosted_invoice_url text,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  component_id uuid references components(id),
  item_type component_type not null,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null default 0
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid not null references invoices(id),
  stripe_payment_intent_id text,
  amount numeric(12,2) not null,
  status text not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Tenant isolation helper
create or replace function is_org_member(org uuid)
returns boolean language sql stable security definer as $$
  select exists(select 1 from organization_members m where m.organization_id = org and m.user_id = auth.uid());
$$;

alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table customers enable row level security;
alter table properties enable row level security;
alter table jobs enable row level security;
alter table components enable row level security;
alter table assemblies enable row level security;
alter table assembly_items enable row level security;
alter table estimates enable row level security;
alter table estimate_items enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;

create policy org_read on organizations for select using (is_org_member(id));
create policy members_read on organization_members for select using (user_id = auth.uid() or is_org_member(organization_id));

-- Apply one consistent CRUD policy to tenant-owned tables.
do $$
declare t text;
begin
  foreach t in array array['customers','properties','jobs','components','assemblies','assembly_items','estimates','estimate_items','invoices','invoice_items','payments']
  loop
    execute format('create policy %I_org_all on %I for all using (is_org_member(organization_id)) with check (is_org_member(organization_id))', t, t);
  end loop;
end $$;
