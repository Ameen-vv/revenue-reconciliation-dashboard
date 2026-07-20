import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-raised p-6 text-center">
      <div className="max-w-lg">
        <h1 className="text-3xl font-semibold text-ink">
          Reconciliation Dashboard
        </h1>
        <p className="mt-3 text-ink2">
          Match an order export against a payment processor export, and see
          exactly where the two disagree and how much money is involved.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-canvas"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
