import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/sign-out-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already gates this route; this is the second line of
  // defence and gives us a typed, non-null user below.
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Reconciliation Dashboard
          </h1>
          <p className="text-sm text-slate-500">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <section className="mx-auto mt-10 max-w-6xl rounded-xl border border-slate-200 bg-white p-8">
        <p className="text-slate-600">
          No data imported yet. The import step and reconciliation results land
          here next.
        </p>
      </section>
    </main>
  );
}
