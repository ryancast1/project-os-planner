import { unstable_cache } from "next/cache";
import { weatherLocation } from "@/lib/weather";
import { fetchAppleForecast } from "./apple";
import { fetchOpenMeteo } from "./openMeteo";

const appleForecast = unstable_cache(fetchAppleForecast, ["ues-apple-weather-v1"], { revalidate: 900 });

export async function GET(request: Request) {
  try {
    const configured = process.env.WEATHERKIT_SERVICE_ID || process.env.WEATHERKIT_PRIVATE_KEY || process.env.WEATHERKIT_KEY_PATH;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: weatherLocation.timezone }).format(new Date());
    const forecast = configured ? await appleForecast(today) : await fetchOpenMeteo(request.signal);
    return Response.json(forecast);
  } catch {
    return Response.json({ error: "Weather unavailable" }, { status: 503 });
  }
}
