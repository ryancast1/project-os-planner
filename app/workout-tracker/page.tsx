import Link from "next/link";

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
  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 px-5 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-3">
         <h1 className="text-2xl font-semibold tracking-tight text-center">
  Workout Tracker
</h1>
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
