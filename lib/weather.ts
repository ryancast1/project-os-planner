export const weatherLocation = {
  name: "Upper East Side",
  latitude: 40.7669,
  longitude: -73.9527,
  timezone: "America/New_York",
};

type Reading = number | null;
export type Forecast = {
  current: {
    time: number;
    temperature_2m: Reading;
    weather_code: Reading;
    is_day: Reading;
    wind_speed_10m: Reading;
  };
  hourly: {
    time: number[];
    temperature_2m: Reading[];
    weather_code: Reading[];
    is_day: Reading[];
    precipitation: Reading[];
    relative_humidity_2m: Reading[];
    dew_point_2m: Reading[];
    precipitation_probability: Reading[];
    wind_speed_10m: Reading[];
  };
  daily: {
    time: number[];
    temperature_2m_min: Reading[];
    temperature_2m_max: Reading[];
    weather_code: Reading[];
    precipitation_probability_max: Reading[];
    sunrise: Reading[];
    sunset: Reading[];
  };
};

export async function fetchForecast(signal: AbortSignal): Promise<Forecast> {
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
    hourly: "temperature_2m,precipitation,relative_humidity_2m,dew_point_2m,weather_code,is_day,precipitation_probability,wind_speed_10m",
    daily: "temperature_2m_min,temperature_2m_max,weather_code,precipitation_probability_max,sunrise,sunset",
  });
  const response = await fetch("https://api.open-meteo.com/v1/forecast?" + params, { signal });
  if (!response.ok) throw new Error("Forecast unavailable");
  return response.json();
}

export function condition(code: Reading, daylight = true): [string, string] {
  if (code == null) return ["—", "Conditions unavailable"];
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
