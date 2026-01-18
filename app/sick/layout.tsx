"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function tabClass(active: boolean) {
  return (
    "flex flex-col items-center justify-center min-h-[44px] rounded-xl px-3 " +
    (active ? "text-neutral-50" : "text-neutral-400")
  );
}

export default function SickLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isSick =
    pathname === "/sick" || pathname.startsWith("/sick/sick");
  const isCS =
    pathname.startsWith("/sick/cs");

  return (
    <main className="min-h-screen bg-black text-neutral-100 flex flex-col">

      {/* Page content */}
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+92px)]">
        {children}
      </div>

      {/* Bottom tabs bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-900 bg-black/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+10px)]">
          <div className="grid grid-cols-[0.9fr_12px_1fr_1fr] items-stretch gap-2">
            {/* Home */}
            <Link
              href="/"
              className={
                "flex flex-col items-center justify-center min-h-[44px] rounded-xl px-3 " +
                (pathname === "/" ? "text-neutral-50" : "text-neutral-400")
              }
              aria-current={pathname === "/" ? "page" : undefined}
            >
              <span className="text-[13px] font-semibold">Home</span>
              <span
                className={
                  "mt-1 h-0.5 w-6 rounded-full " +
                  (pathname === "/" ? "bg-neutral-50" : "bg-transparent")
                }
              />
            </Link>

            {/* Separator */}
            <div className="flex items-center justify-center">
              <div className="h-7 w-px bg-neutral-800/80" />
            </div>

            {/* Tabs */}
            <Link
              href="/sick"
              className={tabClass(isSick)}
              aria-current={isSick ? "page" : undefined}
            >
              <span className="text-[13px] font-semibold">Sick</span>
              <span
                className={
                  "mt-1 h-0.5 w-6 rounded-full " +
                  (isSick ? "bg-neutral-50" : "bg-transparent")
                }
              />
            </Link>

            <Link
              href="/sick/cs"
              className={tabClass(isCS)}
              aria-current={isCS ? "page" : undefined}
            >
              <span className="text-[13px] font-semibold">CS</span>
              <span
                className={
                  "mt-1 h-0.5 w-6 rounded-full " +
                  (isCS ? "bg-neutral-50" : "bg-transparent")
                }
              />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}