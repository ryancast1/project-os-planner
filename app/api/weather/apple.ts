import { sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { weatherLocation, type Forecast } from "@/lib/weather";

type Conditions = {
  conditionCode: string;
  daylight?: boolean;
  temperature?: number;
  windSpeed?: number;
};
type Hour = Conditions & {
  forecastStart: string;
  precipitationAmount?: number;
  precipitationChance?: number;
  humidity?: number;
  temperatureDewPoint?: number;
};
type Day = {
  forecastStart: string;
  conditionCode: string;
  temperatureMin?: number;
  temperatureMax?: number;
  precipitationChance?: number;
  sunrise?: string;
  sunset?: string;
};
type AppleResponse = {
  currentWeather: Conditions & { asOf: string; metadata: { attributionURL: string } };
  forecastHourly: { hours: Hour[] };
  forecastDaily: { days: Day[] };
};

const epoch = (date: string) => Date.parse(date) / 1000;
const convert = (value: number | undefined, scale: number, offset = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value * scale + offset : null;
const fahrenheit = (value?: number) => convert(value, 1.8, 32);
const daylight = (value?: boolean) => value == null ? null : Number(value);

export function normalizeWeather(data: AppleResponse, logo: string): Forecast {
  const { currentWeather: current, forecastHourly: { hours }, forecastDaily: { days } } = data;
  if (!days.length || !hours.length || !Number.isFinite(epoch(current.asOf))) throw new Error("Incomplete Apple forecast");
  return {
    appleAttribution: { logo, legal: current.metadata.attributionURL },
    current: {
      time: epoch(current.asOf), temperature_2m: fahrenheit(current.temperature),
      weather_code: current.conditionCode, is_day: daylight(current.daylight),
      wind_speed_10m: convert(current.windSpeed, 1 / 1.609344),
    },
    hourly: {
      time: hours.map(h => epoch(h.forecastStart)),
      temperature_2m: hours.map(h => fahrenheit(h.temperature)),
      dew_point_2m: hours.map(h => fahrenheit(h.temperatureDewPoint)),
      weather_code: hours.map(h => h.conditionCode),
      precipitation: hours.map(h => convert(h.precipitationAmount, 1 / 25.4)),
      precipitation_probability: hours.map(h => convert(h.precipitationChance, 100)),
      relative_humidity_2m: hours.map(h => convert(h.humidity, 100)),
      wind_speed_10m: hours.map(h => convert(h.windSpeed, 1 / 1.609344)),
      is_day: hours.map(h => daylight(h.daylight)),
    },
    daily: {
      time: days.map(d => epoch(d.forecastStart)),
      temperature_2m_min: days.map(d => fahrenheit(d.temperatureMin)),
      temperature_2m_max: days.map(d => fahrenheit(d.temperatureMax)),
      precipitation_probability_max: days.map(d => d.precipitationChance == null ? null : Math.round(d.precipitationChance * 100)),
      weather_code: days.map(d => d.conditionCode),
      sunrise: days.map(d => d.sunrise ? epoch(d.sunrise) : null),
      sunset: days.map(d => d.sunset ? epoch(d.sunset) : null),
    },
  };
}

async function token() {
  const team = process.env.WEATHERKIT_TEAM_ID;
  const service = process.env.WEATHERKIT_SERVICE_ID;
  const kid = process.env.WEATHERKIT_KEY_ID;
  const key = process.env.WEATHERKIT_PRIVATE_KEY?.replace(/\\n/g, "\n") ||
    (process.env.WEATHERKIT_KEY_PATH && await readFile(process.env.WEATHERKIT_KEY_PATH, "utf8"));
  if (!team || !service || !kid || !key) throw new Error("Incomplete WeatherKit configuration");
  const now = Math.floor(Date.now() / 1000);
  const encode = (data: object) => Buffer.from(JSON.stringify(data)).toString("base64url");
  const input = encode({ alg: "ES256", kid, typ: "JWT", id: team + "." + service }) + "." +
    encode({ iss: team, sub: service, iat: now, exp: now + 3600 });
  return input + "." + sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
}

function midnight(today: string, offset: number) {
  const date = new Date(today + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  // At 04:00 UTC it is either midnight EDT or 23:00 EST the previous day.
  date.setUTCHours(4);
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: weatherLocation.timezone, hour: "numeric", hourCycle: "h23" }).format(date);
  if (Number(hour) !== 0) date.setUTCHours(5);
  return date.toISOString();
}

export async function fetchAppleForecast(today: string) {
  const start = midnight(today, -1);
  const end = midnight(today, 10);
  const params = new URLSearchParams({ dataSets: "currentWeather,forecastHourly,forecastDaily",
    timezone: weatherLocation.timezone, hourlyStart: start, hourlyEnd: end, dailyStart: start, dailyEnd: end });
  const origin = "https://weatherkit.apple.com";
  const options = { headers: { Authorization: "Bearer " + await token() }, cache: "no-store" as const, signal: AbortSignal.timeout(15000) };
  const [weather, attribution] = await Promise.all([
    fetch(origin + "/api/v1/weather/en/" + weatherLocation.latitude + "/" + weatherLocation.longitude + "?" + params, options),
    fetch(origin + "/attribution/en", options),
  ]);
  if (!weather.ok || !attribution.ok) throw new Error("WeatherKit returned " + weather.status + "/" + attribution.status);
  const assets = await attribution.json();
  const data: AppleResponse = await weather.json();
  // The upper boundary may also appear as the first interval of the following day.
  data.forecastDaily.days = data.forecastDaily.days.filter(d => epoch(d.forecastStart) < epoch(end));
  data.forecastHourly.hours = data.forecastHourly.hours.filter(h => epoch(h.forecastStart) < epoch(end));
  return normalizeWeather(data, new URL(assets["logoDark@2x"], origin).href);
}
