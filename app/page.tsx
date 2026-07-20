import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuthForm from "@/components/auth-form";

/**
 * The root is the sign-in screen. There is no marketing page in front of it:
 * this is an internal tool, and anyone reaching it either has an account or
 * needs to create one, both of which happen here.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  // AuthForm reads the ?next= param, so it needs a suspense boundary.
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
