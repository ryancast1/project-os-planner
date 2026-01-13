import Link from "next/link";

export default function HomePage() {
  const tiles = [
    { href: "/planner", title: "Planner", desc: "Today + runway + parking lot" },
    { href: "/projects", title: "Projects", desc: "Initiatives + linked tasks" },
    { href: "/goals", title: "Goals", desc: "Periodic review + notes" },
    { href: "/habits", title: "Habits", desc: "Habits + streaks + charts (later)" },
  ];

  return (
    <main className="min-h-dvh p-6">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight">Project OS</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Personal planner + trackers.
        </p>

        <div className="mt-6 grid gap-3">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-2xl border bg-white p-4 shadow-sm transition active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <div className="text-lg font-medium">{t.title}</div>
                <div className="text-neutral-400">›</div>
              </div>
              <div className="mt-1 text-sm text-neutral-600">{t.desc}</div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-xs text-neutral-500">v0.1</div>
      </div>
    </main>
  );
}