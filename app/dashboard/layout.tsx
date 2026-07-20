import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already gates this route; this is the second line of
  // defence and covers both pages beneath the layout at once.
  if (!user) redirect("/");

  return (
    <div className="min-h-screen bg-canvas md:flex">
      {/* Sticky on desktop so navigation stays reachable down a long table;
          collapses to a stacked bar above the content on narrow screens. */}
      <div className="md:sticky md:top-0 md:h-screen">
        <Sidebar email={user.email} />
      </div>

      <main className="min-w-0 flex-1 px-6 py-8">
        <div className="mx-auto max-w-5xl space-y-5">{children}</div>
      </main>
    </div>
  );
}
