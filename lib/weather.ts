export const weatherLocation = {
  name: "Upper East Side",
  latitude: 40.7669,
  longitude: -73.9527,
  timezone: "America/New_York",
};

type Reading = number | null;
export type Forecast = {
  appleAttribution?: { logo: string; legal: string };
  current: {
    time: number;
    temperature_2m: Reading;
    weather_code: string | Reading;
    is_day: Reading;
    wind_speed_10m: Reading;
  };
  hourly: {
    time: number[];
    temperature_2m: Reading[];
    weather_code: (string | Reading)[];
    is_day: Reading[];
    precipitation: Reading[];
    relative_humidity_2m: Reading[];
    dew_point_2m: Reading[];
    precipitation_probability: Reading[];
    wind_speed_10m: Reading[];
    wind_gusts_10m?: Reading[];
  };
  daily: {
    time: number[];
    temperature_2m_min: Reading[];
    temperature_2m_max: Reading[];
    weather_code: (string | Reading)[];
    precipitation_probability_max: Reading[];
    sunrise: Reading[];
    sunset: Reading[];
  };
};

export async function fetchForecast(signal: AbortSignal): Promise<Forecast> {
  const response = await fetch("/api/weather", { signal });
  if (!response.ok) throw new Error("Forecast unavailable");
  return response.json();
}

export function condition(code: string | Reading, daylight = true): [string, string] {
  if (code == null) return ["—", "Conditions unavailable"];
  if (typeof code === "string") {
    const label = code.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    let icon = "☁️";
    if (/Thunder|Storm|Hurricane|Tropical/.test(code)) icon = "⛈️";
    else if (/Snow|Flurr|Blizzard|Sleet|Hail|Wintry/.test(code)) icon = "🌨️";
    else if (/Rain|Drizzle|Showers/.test(code)) icon = "🌧️";
    else if (/Fog|Haz|Smok|Dust/.test(code)) icon = "🌫️";
    else if (/Wind|Breez/.test(code)) icon = "🌬️";
    else if (/Clear|Hot/.test(code)) icon = daylight ? "☀️" : "🌙";
    else if (code === "PartlyCloudy") icon = daylight ? "⛅" : "☁️";
    return [icon, label.charAt(0).toUpperCase() + label.slice(1)];
  }
  if (code === 0) return daylight ? ["☀️", "Clear"] : ["🌙", "Clear"];
  if (code === 1) return daylight ? ["🌤️", "Mostly clear"] : ["🌙", "Mostly clear"];
  if (code === 2) return [daylight ? "⛅" : "☁️", "Partly cloudy"];
  if (code === 3) return ["☁️", "Overcast"];
  if (code <= 48) return ["🌫️", "Fog"];
  if ([56, 57, 66, 67].includes(code)) return ["🌧️", code < 60 ? "Freezing drizzle" : "Freezing rain"];
  if (code < 60) return ["🌦️", "Drizzle"];
  if (code < 70) return ["🌧️", "Rain"];
  if (code < 80) return ["🌨️", "Snow"];
  if (code < 83) return ["🌦️", "Rain showers"];
  if (code < 90) return ["🌨️", "Snow showers"];
  return ["⛈️", code === 95 ? "Thunderstorms" : "Thunderstorms with hail"];
}
