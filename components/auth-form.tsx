"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

/**
 * The app's front door: sign in, with account creation a click away on the
 * same screen rather than behind a second route. Passwords are never handled
 * by our own code beyond this form field -- hashing, storage and session
 * issuance are Supabase's responsibility.
 */
export default function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isLogin = mode === "login";

  function switchMode(to: Mode) {
    setMode(to);
    setError(null);
    setNotice(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const credentials = { email: email.trim(), password };

    const { data, error } = isLogin
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-ink">
            Reconciliation Dashboard
          </h1>
          <p className="mt-1 text-sm text-ink3">
            Match an order export against a payment export and see exactly where
            the two disagree.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6">
          {/* Both modes on one screen: the switch is a control, not a page
              navigation, so a mistyped choice costs nothing. */}
          <div
            role="tablist"
            aria-label="Sign in or create an account"
            className="mb-5 flex gap-1 rounded-lg border border-line p-1"
          >
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                  mode === m
                    ? "bg-raised text-ink"
                    : "text-ink3 hover:text-ink"
                }`}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-ink2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-ink"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-ink2"
              >
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
                className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-ink"
              />
              {!isLogin && (
                <p className="mt-1 text-xs text-ink3">
                  At least 6 characters.
                </p>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-over-soft px-3 py-2 text-sm text-over"
              >
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
              className="w-full rounded-md bg-ink px-3 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
            >
              {pending
                ? "Working…"
                : isLogin
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <p className="mt-5 border-t border-line pt-4 text-center text-sm text-ink3">
            {isLogin ? "No account yet? " : "Already registered? "}
            <button
              type="button"
              onClick={() => switchMode(isLogin ? "signup" : "login")}
              className="font-medium text-ink underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
