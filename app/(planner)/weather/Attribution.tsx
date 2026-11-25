import Image from "next/image";
import type { Forecast } from "@/lib/weather";

export default function Attribution({ forecast }: { forecast: Forecast }) {
  const apple = forecast.appleAttribution;
  if (!apple) return <a href="https://open-meteo.com/">Open-Meteo</a>;
  return <a href={apple.legal} aria-label="Apple Weather data sources">
    <Image unoptimized src={apple.logo} alt="Apple Weather" width={90} height={18}
      style={{ display: "inline-block", width: "auto", height: 16, verticalAlign: "middle" }} />
  </a>;
}
