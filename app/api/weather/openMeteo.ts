import { weatherLocation, type Forecast } from "@/lib/weather";

export async function fetchOpenMeteo(signal: AbortSignal): Promise<Forecast> {
  // Anchor the requested dates to New York even when the device is traveling.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: weatherLocation.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const dateAtOffset = (days: number) => {
    const date = new Date(today + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const params = new URLSearchParams({
    latitude: String(weatherLocation.latitude),
    longitude: String(weatherLocation.longitude),
    timezone: weatherLocation.timezone,
    temperature_unit: "fahrenheit",
    precipitation_unit: "inch",
    wind_speed_unit: "mph",
    start_date: dateAtOffset(-1),
    end_date: dateAtOffset(9),
    timeformat: "unixtime",
    current: "temperature_2m,weather_code,is_day,wind_speed_10m",
    hourly: "temperature_2m,precipitation,relative_humidity_2m,dew_point_2m,weather_code,is_day,precipitation_probability,wind_speed_10m,wind_gusts_10m",
    daily: "temperature_2m_min,temperature_2m_max,weather_code,precipitation_probability_max,sunrise,sunset",
  });
  const response = await fetch("https://api.open-meteo.com/v1/forecast?" + params, { signal });
  if (!response.ok) throw new Error("Forecast unavailable");
  return response.json();
}
