"use client";

import Link from "next/link";
import { useState } from "react";

const WORKOUT_GROUPS = [
  // Day 0
  [
    { label: "Push Ups", slug: "push-ups" },
    { label: "Bicep Curls", slug: "bicep-curls" },
  ],

  // Day A
  [
    { label: "Shoulder Press", slug: "shoulder-press" },
    { label: "Chest Press", slug: "chest-press" },

    { label: "Lateral Raise", slug: "lateral-raise" },
    { label: "Tricep Extension", slug: "tricep-extension" },
  ],

  // Day B
  [
    { label: "Lat Pulldown", slug: "lat-pulldown" },
    { label: "Row", slug: "row" },

    { label: "Rear Delt Fly", slug: "rear-delt-fly" },
  ],

  // Day C
  [
    { label: "Leg Press", slug: "leg-press" },
    { label: "Leg Curl", slug: "leg-curl" },
    { label: "Leg Ext.", slug: "leg-extension" },
  ],
] as const;

export default function Home() {
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        {qrOpen && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setQrOpen(false)}
              className="absolute inset-0 h-full w-full"
              aria-label="Close"
            />

            <div className="relative mx-auto flex h-full max-w-md items-center justify-center px-5">
              <div className="relative w-full">
                <img
                  src="/qr.jpeg"
                  alt="Gym QR"
                  className="mx-auto w-full max-w-[360px] rounded-2xl border border-white/10 bg-white/5"
                />

                <button
                  type="button"
                  onClick={() => setQrOpen(false)}
                  className="absolute -top-3 -right-3 h-10 w-10 rounded-2xl border border-white/10 bg-black/60 grid place-items-center text-white/80 hover:text-white hover:bg-black/70 active:scale-[0.97] transition"
                  aria-label="Close"
                >
                  <span className="text-lg leading-none">×</span>
                </button>
              </div>
            </div>
          </div>
        )}
        <header className="mb-3 relative">
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="absolute left-0 top-1/2 -translate-y-1/2 h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 active:scale-[0.97] transition"
          >
            QR
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            Workout Tracker
          </h1>
          <Link
            href="/"
            className="absolute right-0 top-1/2 -translate-y-1/2 h-9 w-9 rounded-xl border border-white/10 bg-white/5 grid place-items-center text-white/70 hover:text-white hover:bg-white/10 active:scale-[0.97] transition"
            aria-label="Home"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
            </svg>
          </Link>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="space-y-3">
            {WORKOUT_GROUPS.map((group, gi) => (
              <div
                key={gi}
                className="rounded-2xl border border-white/10 bg-white/5 p-3"
              >
                <div className={`grid ${gi === 2 || gi === 3 ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
                  {group.map((w) => (
                    <Link
                      key={w.slug}
                      href={w.slug === "push-ups" ? "/workout-tracker/push-ups" : `/workout-tracker/workout/${w.slug}`}
                      className="flex h-16 items-center justify-center rounded-xl border border-white/10 bg-black/30 px-3 text-center text-sm font-semibold text-white/90 active:scale-[0.99]"
                    >
                      {w.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <Link
              href="/workout-tracker/workout/other"
              className="flex h-12 w-full items-center justify-center rounded-xl border border-white/10 bg-black/30 px-3 text-center text-xs font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] active:scale-[0.99]"
            >
              Other
            </Link>
          </div>

          <div className="mt-3 space-y-2">
  <Link
    href="/workout-tracker/data"
    className="block h-14 w-full rounded-xl border border-white/10 bg-white/5 text-white text-lg font-semibold grid place-items-center active:scale-[0.99]"
  >
    View / Edit Data
  </Link>

  <Link
    href="/workout-tracker/dashboard"
    className="block h-14 w-full rounded-xl border border-white/10 bg-white/5 text-white text-lg font-semibold grid place-items-center active:scale-[0.99]"
  >
    Dashboard
  </Link>
</div>



        </section>


        
        
      </div>

      
    </main>
  );
}
