-- Support server-side paging, filtering and sorting of discrepancies.
--
-- Previously the page loaded every discrepancy and sliced it in the browser.
-- That is fine at 25 rows and untenable at 10,000, so the ordering and the
-- search key have to exist in the database rather than in TypeScript.
--
-- Three derived columns, all written by the ingest step, which is the only
-- writer. They are plain columns rather than GENERATED expressions because
-- array_to_string is not immutable and could not be used in one.

alter table public.discrepancies
  add column if not exists severity_rank smallint not null default 9;

-- abs(delta_cents), so "biggest money first" is an index-backed ORDER BY
-- instead of an expression PostgREST cannot express.
alter table public.discrepancies
  add column if not exists abs_delta_cents bigint not null default 0;

-- Lowercased concatenation of everything the search box matches against:
-- order key, transaction refs, type and detail.
alter table public.discrepancies
  add column if not exists search_text text;

-- Backfill anything imported before this migration so old imports keep
-- sorting and searching correctly rather than collapsing to rank 9.
update public.discrepancies
set
  severity_rank = case type
    when 'duplicate_payment'  then 0
    when 'status_conflict'    then 1
    when 'missing_payment'    then 2
    when 'orphan_payment'     then 3
    when 'currency_mismatch'  then 4
    when 'amount_mismatch'    then 5
    when 'unsettled_payment'  then 6
    when 'timing_anomaly'     then 7
    when 'rounding_variance'  then 8
    else 9
  end,
  abs_delta_cents = abs(coalesce(delta_cents, 0)),
  search_text = lower(
    coalesce(order_key, '') || ' ' ||
    coalesce(array_to_string(transaction_refs, ' '), '') || ' ' ||
    replace(type, '_', ' ') || ' ' ||
    coalesce(detail, '')
  )
where search_text is null;

-- The exact ORDER BY the list uses, so paging deep into a large import stays
-- an index scan rather than a sort of the whole partition.
create index if not exists discrepancies_page_idx
  on public.discrepancies (import_id, severity_rank, abs_delta_cents desc, order_key);

-- Substring search. pg_trgm makes a leading-wildcard ILIKE indexable; without
-- it this is a sequential scan within the import, which is acceptable but
-- degrades on very large imports.
create extension if not exists pg_trgm;
create index if not exists discrepancies_search_idx
  on public.discrepancies using gin (search_text gin_trgm_ops);

-- Counts per type for the filter dropdown. Doing this as one grouped query
-- avoids either shipping every row to the client or firing ten count queries.
-- SECURITY INVOKER so the caller's RLS policy still applies.
create or replace function public.discrepancy_type_counts(p_import_id uuid)
returns table (type text, n bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.type, count(*)::bigint
  from public.discrepancies d
  where d.import_id = p_import_id
  group by d.type;
$$;
