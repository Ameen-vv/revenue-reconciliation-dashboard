# Reconciliation Dashboard

Reconciles a store's order export against its payment processor export,
classifies every way the two disagree, and quantifies the money involved in
both directions.

- **Live app:** _(deployment URL)_
- **Test credentials:** sign-up is open and requires no email confirmation, so
  any address works. A seeded account is listed under [Demo account](#demo-account).

---

## 1. What I found in the data

`orders.csv` holds 186 lines: a header and 185 rows, one of which is an exact
duplicate. `payments.csv` holds 187 rows.

### Format damage — normalised on ingest, **not** reported as discrepancies

These are the traps. Each one, left alone, manufactures problems that do not
exist, and inventing false positives is as bad as missing real ones.

| What | Where | Consequence if untreated |
|---|---|---|
| Two date formats | orders are ISO `YYYY-MM-DD HH:mm:ss`; payments are day-first `DD/MM/YYYY HH:mm` | `new Date("02/04/2025")` reads as 4 February, not 2 April. Roughly two thirds of payment rows shift by up to eleven months and every timing check becomes noise. Payments are parsed with an explicit `dd/MM/yyyy HH:mm` pattern. |
| Case and whitespace on the join key | `payments.order_reference` contains `" ord-1801 "` and `"ord-1802"` | Each would surface as one orphan payment *and* one missing payment — four invented problems from two cosmetic defects. The key is trimmed and upper-cased on both sides. |
| Duplicate order row | `ORD-1004` appears twice, byte-identical | Double-counted revenue. Dropped on ingest, and the count is recorded on the import so the drop is visible rather than silent. |

`net_amount = gross_amount − discount` holds for **every** order row, which is
asserted in the test suite. That makes `net_amount` the trustworthy expected
charge; `gross_amount` would systematically over-state what was owed on the
73 discounted orders.

### The real discrepancies — 25 across 10 classes

| Type | Count | Orders | What it means for the business |
|---|---|---|---|
| `missing_payment` | 4 | ORD-1201…1204 | Completed orders with no payment of any kind. Goods went out, nothing was ever charged. |
| `orphan_payment` | 3 | ORD-1301…1303 | Settled charges against orders that do not exist. Income that cannot be attributed or recognised, and may need refunding. |
| `amount_mismatch` | 3 | ORD-1401 (+25.00), ORD-1402 (−18.50), ORD-1403 (+60.00) | Charged the wrong amount in both directions. Two overcharges are refund exposure; one undercharge is lost margin. |
| `duplicate_payment` | 2 | ORD-1501, ORD-1502 | The same amount settled twice. The single most likely trigger for a customer-initiated chargeback. |
| `currency_mismatch` | 2 | ORD-1601, ORD-1602 | Order and payment denominated in different currencies. Unresolvable without a rate source. |
| `status_conflict` | 3 | ORD-1701, ORD-1702, ORD-1703 | Lifecycle status and money disagree: a cancelled order still holding 175.00; a "refunded" order where only 120.00 of 240.00 came back; a "completed" order refunded in full. |
| `rounding_variance` | 3 | ORD-1901 (+0.01), ORD-1902 (−0.02), ORD-1903 (+0.01) | Sub-tolerance noise. Individually ignorable; worth a look only as a pattern. |
| `unsettled_payment` | 2 | ORD-2001 (failed), ORD-2002 (pending) | The order system counts these as revenue. The bank does not. |
| `timing_anomaly` | 1 | ORD-2101 | Charge captured 29 days after the order. Late captures are disproportionately disputed. |
| `incomplete_record` | 2 | ORD-2201, ORD-2202 | Missing customer email and discount on an order; missing `processed_at` on a payment. The money reconciles; the record cannot support invoicing or audit. |

### The money

| | |
|---|---|
| Taken in excess or unattributed | **936.60** |
| Never collected | **886.87** |
| **Net exposure** | **+49.73** |

**The net figure is the trap.** Two roughly $900 problems pointing in opposite
directions nearly cancel, and a dashboard leading with "$49.73 at risk" would
read as *nothing is wrong*. They are not the same problem and do not have the
same remedy: money taken in excess must be refunded before it becomes a
chargeback, money never collected must be chased. The dashboard therefore
reports both directions separately and treats the net as a footnote.

### Two places where the seeded pattern is not what it first appears

The identifier blocks in this data are clearly seeded by class (12xx missing,
13xx orphan, and so on), which invites assuming a fixed count per block. Two
blocks do not follow the obvious reading:

- **`currency_mismatch` is 2, not 1.** ORD-1601 is a USD order charged in EUR.
  ORD-1602 is its mirror — an EUR order charged in USD — and is the same defect
  with the currencies swapped.
- **`rounding_variance` is 3, not 2.** ORD-1901 (+0.01) and ORD-1902 (−0.02)
  are joined by ORD-1903 (154.96 ordered, 154.97 settled).

Both are asserted by order key in the test suite rather than by count alone.

---

## 2. Reconciliation logic

The engine is `lib/reconcile.ts`, a single pure function
`reconcile(orders, payments): Discrepancy[]`. No I/O, no clock, no randomness,
no database, and no LLM. Same input, same output, every time — which is what
makes it testable and what makes an audit trail meaningful.

### Matching

**Exact key only, after normalisation.** The join key is
`trim(order_reference).toUpperCase()`, matched against the same transform of
`order_id`.

There is deliberately **no fuzzy fallback** on customer email plus a similar
amount. With repeat customers and round-numbered orders, fuzzy matching
produces confident-looking links that are simply wrong, and a reconciliation
tool that invents a match is worse than one that reports it could not find one.
Every unmatched row is surfaced, not guessed at.

### Rules and why

**Expected charge is `net_amount`, not `gross_amount`.** The relationship
`net = gross − discount` holds on every row, so `net` is what the customer
should have been billed. Using `gross` would flag all 73 discounted orders as
under-collected.

**Only `type = 'charge'` and `status = 'settled'` count toward reconciling an
order.** A pending or failed charge is not revenue however the order system
reports it, so it gets its own class rather than being netted in or treated as
absent.

**Refunds are netted per order** (`charges − refunds`). This makes a partial
refund fall out naturally as a smaller settled amount instead of needing a
dedicated class.

**Tolerance is `abs(delta) ≤ 2` cents — absolute, not a percentage.** A
percentage band is the intuitive choice and it is wrong: at 0.5% it forgives a
$2.50 error on a $500 order while flagging a $0.15 error on a $20 one, which is
exactly backwards. A processor's rounding error does not scale with order size.
Two cents covers half-cent rounding applied twice and nothing else. In this
dataset the gap between the largest variance (2¢) and the smallest real
mismatch ($18.50) is three orders of magnitude, so the threshold is not
load-bearing — but it is defensible if the data were tighter.

**Currency mismatches are classified and stopped, never converted.** No FX
conversion happens anywhere. Without a rate source, and the rate as of the
correct moment, any converted figure is a guess presented as a reconciled
result. These rows carry `delta = null`, are excluded from the money totals,
and are reported by count. Showing them as zero exposure would be a lie in the
opposite direction.

**Money is integer cents everywhere.** No float is ever compared for equality.
`toCents` parses the decimal string directly rather than via `parseFloat`,
because `1.005 * 100` is `100.49999999999999` and that is precisely how a
reconciliation tool acquires phantom one-cent discrepancies.

### Where one order carries several problems

An order can carry multiple flags — an unsettled payment and an incomplete
record are independent facts. But three classes **suppress** the generic
amount comparison, because each already explains the amount difference in full:

- `duplicate_payment` — ORD-1501 settling 239.68 against an expected 119.84 is
  one problem, not two. Reporting a duplicate *and* a $119.84 amount mismatch
  would double-count the same dollars in "value at risk".
- `status_conflict` — the shortfall on a refunded order *is* the refund.
- `currency_mismatch` — the amounts are not comparable at all.

Similarly, `missing_payment` requires **zero** payment rows, not zero *settled*
ones. Otherwise ORD-2001 (failed) and ORD-2002 (pending) would each be counted
twice, once as missing and once as unsettled.

### Severity ordering

Ranked by what it costs to leave the row alone, which is the dashboard's
default sort:

`duplicate_payment` → `status_conflict` → `missing_payment` →
`orphan_payment` → `currency_mismatch` → `amount_mismatch` →
`unsettled_payment` → `timing_anomaly` → `rounding_variance` →
`incomplete_record`

Duplicates and status conflicts lead because that is cash already out of the
door carrying chargeback risk. Rounding and incompleteness sit at the bottom
where they cannot bury a real problem. Within a class, rows sort by absolute
delta, so the biggest money is always first.

### Tests

`lib/reconcile.test.ts` — 26 tests: one hand-built fixture per class, boundary
tests either side of the 2-cent tolerance, an order-independence test proving
repeatability, and a suite that runs the real CSVs and asserts both the exact
counts **and** the specific order keys behind every class.

```bash
npm test
```

---

## 3. Setup and local run

```bash
npm install
cp .env.example .env.local     # fill in the values below
npm run dev                    # http://localhost:3000
```

Apply the schema to a fresh Supabase project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

In **Authentication → Sign In / Providers → Email**, turn **off** "Confirm
email" so sign-up returns a session immediately.

Environment variables — see `.env.example`:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon key; safe in the browser, RLS does the enforcing |
| `GROQ_API_KEY` | no | Explanation layer. Unset ⇒ static explanations, app still works |
| `LLM_MODEL` | no | Defaults to `llama-3.3-70b-versatile` |

### Demo account

_(to be filled in once deployed)_

---

## 4. Architecture

A single Next.js 15 App Router application on Vercel, with Supabase for both
Postgres and auth.

```
app/
  page.tsx              sign in / create account; redirects when signed in
  dashboard/layout.tsx  sidebar shell, auth gate for both pages
  dashboard/page.tsx    overview: headline figures, priorities, chart
  dashboard/discrepancies/  the paginated drill-down table
  api/import/route.ts   parse -> normalise -> reconcile -> persist
  api/explain/route.ts  LLM explanation for one discrepancy
lib/
  reconcile.ts          the engine: pure, deterministic, tested
  ingest.ts             CSV parsing, date/key normalisation, dedupe
  money.ts              integer-cent conversion and formatting
  summary.ts            headline roll-ups
  explanations.ts       static per-type fallbacks
  supabase/             browser, server and middleware clients
middleware.ts           session refresh + route gating
supabase/migrations/    schema, indexes and RLS policies
```

**Why one deployment.** Inside a short build window, a single Next.js app
removes an entire class of problems — CORS, a second deploy target, token
forwarding between services — for no loss in correctness. The engine is already
an isolated pure module with no framework imports, so lifting it into its own
service is a mechanical change if reconciliation ever needs to scale
independently or run on a schedule.

**Security.** Every table carries `user_id` with RLS enabled and an owner-only
policy. The server client is always constructed with the **anon** key plus the
caller's cookies — there is no service-role key anywhere in the app — so every
query runs as the logged-in user and the database, not application code,
enforces isolation. A missing policy fails closed rather than leaking. The
middleware uses `getUser()`, which revalidates against the auth server, rather
than `getSession()`, which merely decodes a cookie and would trust a forged
one. Anonymous browsers hitting a protected page are redirected; anonymous
`fetch` calls to `/api/*` get a 401 JSON body they can actually parse.

Verified: a second signed-in user and an anonymous client both read zero rows
from another user's import.

**Import model.** Each run writes a new `import_id` and everything hangs off
it, so a double-clicked button produces a second independent import rather than
doubling the first one's rows. If any write in a run fails, the parent import
row is deleted so the dashboard never reads a half-populated import as
complete. Uploaded CSVs are parsed and discarded — the files themselves are
never stored.

---

## 5. LLM approach

The model **explains** and never decides. It is invoked only after the engine
has classified a row, receives that classification as settled fact, and is
explicitly instructed not to re-litigate it. A bad response degrades a panel in
the UI; it cannot corrupt a reconciliation result.

Groq's OpenAI-compatible endpoint, `llama-3.3-70b-versatile`.

**Temperature 0.** This is an audit tool. Opening the same discrepancy twice
must produce the same explanation, or a reader cannot tell whether something
changed in the data or only in the wording. Sampling variety has no value here:
there is one correct explanation of a duplicate charge, and creative paraphrase
is a liability in a document someone may act on. `max_tokens` is capped at 400
to keep the panel readable, and `response_format: json_object` is set so the
model returns parseable output rather than prose wrapped in a code fence.

**The request is server-side and id-only.** The client posts a discrepancy id;
the route loads the record from the database under RLS. A client-supplied
payload is never trusted, so a caller cannot make the model explain a
fabricated amount or another user's row. The key is read from the server
environment and has no `NEXT_PUBLIC_` prefix.

**Handling bad responses.** The reply is `JSON.parse`d and then validated with
Zod against `{ likely_cause, recommended_action, confidence }`. Anything that
fails — malformed JSON, right shape but wrong keys, an empty completion, a
network error — triggers exactly one retry, and if that also fails the route
serves a static per-type explanation from `lib/explanations.ts`. **The UI
labels that state explicitly**, so a canned line is never mistaken for analysis
of a specific row. With no API key configured at all the app degrades to the
same static path and remains fully usable.

Successful explanations are cached on the discrepancy row, which keeps the
tool's output stable between visits and avoids re-billing the same record.

---

## 6. What I would build next

1. **Resolution workflow** — assign, comment on, and mark discrepancies
   resolved, with an audit trail. Right now it identifies problems but cannot
   track them being fixed, which is the difference between a report and a tool.
2. **Background jobs for large imports.** Parsing and reconciling happen in the
   request. At a few hundred rows that is instant; at a million it needs a
   queue, chunked inserts, and a progress indicator.
3. **Import-to-import comparison** — is the leak getting better or worse? A
   single snapshot cannot answer the question a revenue owner actually has.
4. **Integration tests in CI.** The engine is well covered; the auth and
   ingestion routes are verified but by hand.
5. **Configurable tolerances and rules** per merchant, rather than constants in
   the engine.
6. **Split the reconciliation service out** if volume justifies it — the engine
   is already a self-contained pure module.

---

## 7. Note on AI tool usage

AI-assisted development tools were used throughout, for scaffolding,
boilerplate and drafting. All reconciliation rules, tolerance choices,
classification boundaries and the suppression logic between overlapping classes
are my own decisions, and the data findings above were verified against the raw
CSVs rather than taken on trust — including the two places where the seeded
pattern differs from the obvious reading.
