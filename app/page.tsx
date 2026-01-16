import Link from "next/link";

export default function HomePage() {
  const tiles = [
    { href: "/planner", title: "Planner" },
    { href: "/workout-tracker", title: "Workout Tracker" },
    { href: "/movie-tracker", title: "Movie Tracker" },
    { href: "/trich", title: "Trich Tracker" },
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
              className="grid h-20 place-items-center rounded-3xl border border-neutral-200 bg-neutral-900 text-white shadow-sm transition active:scale-[0.99]"
            >
              <div className="text-xl font-semibold tracking-tight">{t.title}</div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-xs text-neutral-500">v0.1</div>
      </div>
    </main>
  );
}