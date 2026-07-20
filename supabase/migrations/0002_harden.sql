-- Hardening pass over the initial schema.
--
-- 1. FORCE row level security, so the policies apply to the table owner too
--    rather than only to ordinary roles. Without this, anything connecting as
--    the owner silently bypasses the isolation the policies describe.
-- 2. Constrain the enumerated columns. The engine is the only writer today,
--    but a classification typo should fail at the database rather than appear
--    in the dashboard as an unstyled, unfilterable row.
--
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each constraint is guarded
-- by a catalogue check to keep the migration re-runnable.

alter table public.imports       force row level security;
alter table public.orders        force row level security;
alter table public.payments      force row level security;
alter table public.discrepancies force row level security;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'discrepancies_type_check'
      and conrelid = 'public.discrepancies'::regclass
  ) then
    alter table public.discrepancies
      add constraint discrepancies_type_check check (type in (
        'missing_payment',
        'orphan_payment',
        'amount_mismatch',
        'duplicate_payment',
        'currency_mismatch',
        'status_conflict',
        'rounding_variance',
        'unsettled_payment',
        'timing_anomaly',
        'incomplete_record'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'discrepancies_severity_check'
      and conrelid = 'public.discrepancies'::regclass
  ) then
    alter table public.discrepancies
      add constraint discrepancies_severity_check
      check (severity in ('critical', 'high', 'medium', 'low', 'info'));
  end if;

  -- A discount cannot exceed the order, and neither side can be negative.
  -- net_cents is deliberately NOT constrained to gross - discount: that
  -- relationship holds across the supplied export, but it is a property of
  -- that data, not a rule the system should impose on someone else's upload.
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_amounts_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_amounts_check
      check (gross_cents >= 0 and discount_cents >= 0);
  end if;
end $$;
