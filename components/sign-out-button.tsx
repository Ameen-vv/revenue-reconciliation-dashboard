"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="whitespace-nowrap rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink2 hover:bg-raised hover:text-ink"
    >
      Sign out
    </button>
  );
}
