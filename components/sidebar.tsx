"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/sign-out-button";
import ThemeToggle from "@/components/theme-toggle";

const TABS = [
  {
    href: "/dashboard",
    label: "Overview",
    hint: "Headline figures and priorities",
    icon: (
      <path d="M3 3h6v8H3V3Zm0 10h6v4H3v-4Zm8 0h6v4h-6v-4Zm0-10h6v8h-6V3Z" />
    ),
  },
  {
    href: "/dashboard/discrepancies",
    label: "Discrepancies",
    hint: "Every row, searchable",
    icon: (
      <path d="M3 4h14v2H3V4Zm0 5h14v2H3V9Zm0 5h9v2H3v-2Z" />
    ),
  },
];

export default function Sidebar({ email }: { email?: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex shrink-0 flex-col border-b border-line bg-surface md:h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="border-line px-5 py-4 md:border-b">
        <p className="text-sm font-semibold text-ink">
          Reconciliation Dashboard
        </p>
        <p className="mt-0.5 text-xs text-ink3">
          Orders checked against payments
        </p>
      </div>

      <nav className="flex gap-1 px-3 py-3 md:flex-1 md:flex-col">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                active
                  ? "bg-raised text-ink"
                  : "text-ink2 hover:bg-raised hover:text-ink"
              }`}
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className="h-4 w-4 shrink-0"
              >
                {tab.icon}
              </svg>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{tab.label}</span>
                <span className="hidden text-xs text-ink3 md:block">
                  {tab.hint}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* The email gets its own row on desktop so the two controls below it
          always have room to sit side by side without the label wrapping. */}
      <div className="border-line px-4 py-3 md:border-t">
        <p
          className="mb-2 hidden min-w-0 truncate text-xs text-ink3 md:block"
          title={email}
        >
          {email}
        </p>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
