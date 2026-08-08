import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  const iconTiles: { href: string; title: string; icon?: string }[] = [
    { href: "/planner", title: "Planner", icon: "/icons/planner.png" },
    { href: "/situation", title: "Situation", icon: "/icons/situation.png" },
    { href: "/workout-tracker", title: "Gym", icon: "/icons/workout.png" },
    { href: "/running", title: "Running", icon: "/icons/running.png" },
    { href: "/movie-tracker", title: "Movies", icon: "/icons/movie.png" },
    { href: "/packing", title: "Packing", icon: "/icons/packing.png" },
    { href: "/vice", title: "Vices", icon: "/icons/vice.png" },
    { href: "/trich", title: "Trich Tracker", icon: "/icons/trich.png" },
    { href: "/cc", title: "CC", icon: "/icons/cc.png" },
    { href: "/sick", title: "Sick Log", icon: "/icons/sick.png" },
  ];

  return (
    <main className="min-h-dvh p-6">
      <div className="mx-auto max-w-md">
        <div className="mt-2">
          {/* 2-column grid of all apps */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 px-4 justify-items-center">
            {iconTiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="relative w-36 aspect-square overflow-hidden rounded-3xl bg-neutral-900 shadow-sm transition active:scale-[0.99]"
                aria-label={t.title}
                title={t.title}
              >
                <span className="sr-only">{t.title}</span>
                <div className="absolute inset-0 p-3">
                  {t.icon ? (
                    <Image
                      src={t.icon}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 50vw, 240px"
                      className="object-contain"
                      priority
                    />
                  ) : (
                    <div className="h-full w-full rounded-2xl border border-neutral-700 bg-neutral-800" />
                  )}
                </div>
              </Link>
            ))}
            <Link
              href="/database"
              className="col-span-2 flex h-16 w-full items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-base font-semibold text-neutral-100 shadow-sm transition active:scale-[0.99]"
              aria-label="Database"
              title="Database"
            >
              Database
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
