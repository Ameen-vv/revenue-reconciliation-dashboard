-- Reconciliation Dashboard: core schema.
--
-- Every table is scoped to the owning user and protected by RLS so that a
-- logged-in user can only ever read or write rows they created. Money is
-- stored exclusively as integer cents; no float column exists anywhere.
--
-- For the join key and the timestamps we deliberately keep BOTH the raw value
-- as it appeared in the CSV and the normalized value the engine uses. The raw
-- columns are the audit trail: when the dashboard claims a payment referenced
-- " ord-1801 ", we can show the original string next to the key we matched on.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- imports: one row per ingestion run. Everything else hangs off this id, which
-- is what makes a re-import additive rather than destructive.
-- ---------------------------------------------------------------------------
create table if not exists public.imports (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  source             text not null default 'sample',
  orders_count       integer not null default 0,
  payments_count     integer not null default 0,
  duplicates_dropped integer not null default 0
);

create index if not exists imports_user_created_idx
  on public.imports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- orders: the store's view of what it sold.
-- order_key is the normalized (trim + uppercase) join key; raw_order_id keeps
-- the original string.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id              bigint generated always as identity primary key,
  import_id       uuid not null references public.imports (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  order_key       text not null,
  raw_order_id    text not null,
  order_date_raw  text,
  order_date      timestamptz,
  customer_email  text,
  currency        text,
  gross_cents     bigint not null,
  discount_cents  bigint not null,
  net_cents       bigint not null,
  status          text
);

-- Within a single import an order key is unique: the ingest step drops the
-- exact-duplicate row before it ever reaches the database.
create unique index if not exists orders_import_key_uniq
  on public.orders (import_id, order_key);
create index if not exists orders_user_import_idx
  on public.orders (user_id, import_id);

-- ---------------------------------------------------------------------------
-- payments: the processor's view of what actually moved.
-- A payment may legitimately point at an order_key that does not exist in
-- orders; that is the orphan_payment case, not a constraint violation, so
-- there is no foreign key between these two tables.
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                  bigint generated always as identity primary key,
  import_id           uuid not null references public.imports (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  transaction_ref     text not null,
  order_key           text,
  raw_order_reference text,
  processed_at_raw    text,
  processed_at        timestamptz,
  currency            text,
  amount_cents        bigint not null,
  fee_cents           bigint not null,
  net_settled_cents   bigint not null,
  type                text,
  status              text
);

create unique index if not exists payments_import_ref_uniq
  on public.payments (import_id, transaction_ref);
create index if not exists payments_user_import_idx
  on public.payments (user_id, import_id);
create index if not exists payments_import_key_idx
  on public.payments (import_id, order_key);

-- ---------------------------------------------------------------------------
-- discrepancies: the output of the deterministic engine.
-- transaction_refs is an array because several classes (duplicate_payment,
-- status_conflict on a refunded order) implicate more than one payment.
-- llm_explanation caches the generated narrative so the same discrepancy is
-- never re-billed to the model twice.
-- ---------------------------------------------------------------------------
create table if not exists public.discrepancies (
  id               uuid primary key default gen_random_uuid(),
  import_id        uuid not null references public.imports (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  type             text not null,
  severity         text not null,
  order_key        text,
  transaction_refs text[] not null default '{}',
  expected_cents   bigint,
  actual_cents     bigint,
  delta_cents      bigint,
  detail           text,
  llm_explanation  jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists discrepancies_user_import_idx
  on public.discrepancies (user_id, import_id);
create index if not exists discrepancies_import_type_idx
  on public.discrepancies (import_id, type);

-- ---------------------------------------------------------------------------
-- Row Level Security.
-- Enabled on every table, with an identical owner-only policy. Without the
-- policies below an enabled-RLS table denies everything, so these are what
-- make the app work at all -- there is no path where a missing policy
-- silently exposes data.
-- ---------------------------------------------------------------------------
alter table public.imports        enable row level security;
alter table public.orders         enable row level security;
alter table public.payments       enable row level security;
alter table public.discrepancies  enable row level security;

drop policy if exists imports_owner on public.imports;
create policy imports_owner on public.imports
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists orders_owner on public.orders;
create policy orders_owner on public.orders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists payments_owner on public.payments;
create policy payments_owner on public.payments
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists discrepancies_owner on public.discrepancies;
create policy discrepancies_owner on public.discrepancies
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
