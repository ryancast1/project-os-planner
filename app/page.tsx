import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  const iconTiles: { href: string; title: string; icon: string }[] = [
    { href: "/planner", title: "Planner", icon: "/icons/planner.png" },
    { href: "/movie-tracker", title: "Movie Tracker", icon: "/icons/movie.png" },
    { href: "/workout-tracker", title: "Workout Tracker", icon: "/icons/workout.png" },
    { href: "/trich", title: "Trich Tracker", icon: "/icons/trich.png" },
    { href: "/cc", title: "Cocktail Chatter", icon: "/icons/cc.png" },
    { href: "/packing", title: "Packing", icon: "/icons/packing.png" },
    { href: "/sick", title: "Sick Log", icon: "/icons/sick.png" },
  ];

  return (
    <main className="min-h-dvh p-6">
      <div className="mx-auto max-w-md">
        <div className="mt-2">
          {/* Planner - centered at top */}
          <div className="flex justify-center mb-6">
            <Link
              href={iconTiles[0].href}
              className="relative w-36 aspect-square overflow-hidden rounded-3xl bg-neutral-900 shadow-sm transition active:scale-[0.99]"
              aria-label={iconTiles[0].title}
              title={iconTiles[0].title}
            >
              <span className="sr-only">{iconTiles[0].title}</span>
              <div className="absolute inset-0 p-3">
                <Image
                  src={iconTiles[0].icon}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 240px"
                  className="object-contain"
                  priority
                />
              </div>
            </Link>
          </div>

          {/* Rest of apps - 2x3 grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 px-4 justify-items-center">
            {iconTiles.slice(1).map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="relative w-36 aspect-square overflow-hidden rounded-3xl bg-neutral-900 shadow-sm transition active:scale-[0.99]"
                aria-label={t.title}
                title={t.title}
              >
                <span className="sr-only">{t.title}</span>
                <div className="absolute inset-0 p-3">
                  <Image
                    src={t.icon}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 50vw, 240px"
                    className="object-contain"
                    priority
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}