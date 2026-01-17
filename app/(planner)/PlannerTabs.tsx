"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function PlannerTabs() {
  const pathname = usePathname();

  const tabs = [
    { href: "/", label: "Home" },
    { href: "/planner", label: "Planner" },
    { href: "/goals", label: "Projects/Goals" },
    { href: "/habits", label: "Habits" },
    { href: "/calendar", label: "Calendar" },
  ] as const;

  const [homeTab, ...otherTabs] = tabs;

  return (
    <nav
      className={clsx(
        "fixed inset-x-0 bottom-0 z-[80] border-t border-neutral-800 bg-neutral-950/95",
        "backdrop-blur supports-[backdrop-filter]:bg-neutral-950/70"
      )}
      aria-label="Planner tabs"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-[0.85fr_12px_1fr_1fr_1fr_1fr] items-stretch gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-1">
        {/* Home: distinct button */}
        {(() => {
          const active = pathname === homeTab.href;
          return (
            <Link
              href={homeTab.href}
              className={clsx(
                "flex flex-col items-center justify-center min-h-[56px] rounded-xl px-2",
                "border",
                active
                  ? "bg-neutral-50 text-neutral-950 border-neutral-50"
                  : "bg-neutral-50/10 text-neutral-100 border-neutral-700"
              )}
              aria-current={active ? "page" : undefined}
            >
              <span className="text-[13px] font-semibold">{homeTab.label}</span>
            </Link>
          );
        })()}

        {/* Separator */}
        <div className="flex items-center justify-center">
          <div className="h-8 w-px bg-neutral-800/80" />
        </div>

        {/* Other tabs */}
        {otherTabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={clsx(
                "flex flex-col items-center justify-center py-4 min-h-[56px] rounded-xl",
                active ? "text-neutral-50" : "text-neutral-400"
              )}
              aria-current={active ? "page" : undefined}
            >
              <span className="text-[13px] font-semibold">{t.label}</span>
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