"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

/**
 * Email/password auth against Supabase Auth. Passwords are never handled by
 * our own code beyond this form field -- hashing, storage and session issuance
 * are Supabase's responsibility.
 */
export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const credentials = { email: email.trim(), password };

    const { data, error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }

    // With email confirmation switched on, signUp returns a user but no
    // session. Say so rather than bouncing to a page that will redirect back.
    if (!data.session) {
      setNotice("Check your inbox to confirm your address, then sign in.");
      setPending(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  const isLogin = mode === "login";

  return (
    <main className="flex min-h-screen items-center justify-center bg-raised p-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">
          {isLogin ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-1 text-sm text-ink3">Reconciliation Dashboard</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink2">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink2">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-over-soft px-3 py-2 text-sm text-over">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-md bg-good/10 px-3 py-2 text-sm text-good">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-ink px-3 py-2 text-sm font-medium text-canvas disabled:opacity-50"
          >
            {pending ? "Working…" : isLogin ? "Sign in" : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-sm text-ink3">
          {isLogin ? "No account yet? " : "Already registered? "}
          <Link
            href={isLogin ? "/signup" : "/login"}
            className="font-medium text-ink underline"
          >
            {isLogin ? "Sign up" : "Sign in"}
          </Link>
        </p>
      </div>
    </main>
  );
}
