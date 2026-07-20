import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/sign-out-button";
import ImportPanel from "@/components/import-panel";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already gates this route; this is the second line of
  // defence and gives us a typed, non-null user below.
  if (!user) redirect("/login");

  // RLS restricts this to the caller's own imports, so no user_id filter is
  // needed here for correctness -- the database applies it.
  const { data: latestImport } = await supabase
    .from("imports")
    .select("id, created_at, orders_count, payments_count, duplicates_dropped")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Reconciliation Dashboard
            </h1>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
          <SignOutButton />
        </header>

        <ImportPanel hasData={Boolean(latestImport)} />

        {latestImport ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
            Imported {latestImport.orders_count} orders and{" "}
            {latestImport.payments_count} payments
            {latestImport.duplicates_dropped > 0 &&
              `, dropping ${latestImport.duplicates_dropped} duplicate order row`}
            .
          </section>
        ) : (
          <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-slate-600">
              Nothing imported yet. Load the sample dataset above to see where
              the two systems disagree.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
