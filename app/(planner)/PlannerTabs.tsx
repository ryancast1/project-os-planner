"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function PlannerTabs() {
  const pathname = usePathname();

  const tabs = [
    { href: "/planner", label: "Planner" },
    { href: "/goals", label: "Goals" },
    { href: "/projects", label: "Projects" },
    { href: "/habits", label: "Habits" },
    { href: "/calendar", label: "Calendar" },
  ] as const;

  return (
    <nav
      className={clsx(
        "fixed inset-x-0 bottom-0 z-[80] border-t border-neutral-800 bg-neutral-950/95",
        "backdrop-blur supports-[backdrop-filter]:bg-neutral-950/70"
      )}
      aria-label="Planner tabs"
    >
      <div className="mx-auto flex max-w-6xl items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={clsx(
                "flex flex-1 flex-col items-center justify-center py-3 rounded-xl",
                active ? "text-neutral-50" : "text-neutral-400"
              )}
              aria-current={active ? "page" : undefined}
            >
              <span className="text-[12px] font-semibold">{t.label}</span>
              <span
                className={clsx(
                  "mt-1 h-0.5 w-6 rounded-full",
                  active ? "bg-neutral-50" : "bg-transparent"
                )}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}