"use client";

import { useState } from "react";
import { condition, weatherLocation, type Forecast } from "@/lib/weather";
import { useForecast } from "./useForecast";
import DayDetail from "./DayDetail";
import s from "./weather.module.css";

const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: weatherLocation.timezone });
const hour = formatter({ hour: "numeric" });
const clock = formatter({ hour: "numeric", minute: "2-digit" });
const calendarDate = formatter({ year: "numeric", month: "numeric", day: "numeric" });
const weekday = formatter({ weekday: "short" });
const value = (n: number | null, unit: string) => n == null ? "—" : Math.round(n) + unit;
const modes = ["Conditions", "Precipitation", "Wind"] as const;
type Mode = typeof modes[number];

function Hourly({ forecast }: { forecast: Forecast }) {
  const [mode, setMode] = useState<Mode>("Conditions");
  const { current, hourly, daily } = forecast;
  const now = current.time;
  const index = hourly.time.findLastIndex(t => t <= now);
  const entries = hourly.time.flatMap((time, i) => {
    if (i < index || time > now + 86400) return [];
    const present = i === index;
    const [icon, label] = condition(present ? current.weather_code : hourly.weather_code[i],
      (present ? current.is_day : hourly.is_day[i]) === 1);
    const temp = present ? current.temperature_2m : hourly.temperature_2m[i];
    const wind = present ? current.wind_speed_10m : hourly.wind_speed_10m[i];
    return [{ time: present ? now : time, title: present ? "Now" : hour.format(time * 1000),
      icon: mode === "Conditions" ? icon : mode === "Wind" ? "🌬️" : "💧",
      label: mode === "Conditions" ? label : mode,
      reading: mode === "Conditions" ? value(temp, "°") : mode === "Wind" ? value(wind, " mph") : value(hourly.precipitation_probability[i], "%") }];
  });
  if (mode === "Conditions") {
    for (const event of ["sunrise", "sunset"] as const) {
      for (const time of daily[event]) {
        if (time != null && time > now && time <= now + 86400) entries.push({
          time, title: clock.format(time * 1000), icon: event === "sunrise" ? "🌅" : "🌇",
          label: event, reading: event === "sunrise" ? "Sunrise" : "Sunset",
        });
      }
    }
    entries.sort((a, b) => a.time - b.time);
  }
  return <section className={s.card} aria-label="Hourly forecast">
    <header className={s.header}><h2>Hourly forecast</h2>
      <div className={s.switcher}>{modes.map(m => <button key={m} aria-pressed={m === mode} onClick={() => setMode(m)}>{m}</button>)}</div>
    </header>
    <div className={s.hours} tabIndex={0} aria-label="Next 24 hours">{entries.map(e =>
      <div className={s.hour} key={e.time + e.label}><span>{e.title}</span><span className={s.icon} role="img" aria-label={e.label}>{e.icon}</span><strong>{e.reading}</strong></div>
    )}</div>
  </section>;
}

function Days({ forecast }: { forecast: Forecast }) {
  const [selected, setSelected] = useState<number | null>(null);
  const { current, daily } = forecast;
  const currentDate = calendarDate.format(current.time * 1000);
  const today = daily.time.findIndex((time, i) =>
    calendarDate.format((daily.sunrise[i] ?? time) * 1000) === currentDate);
  const min = Math.min(...daily.temperature_2m_min.slice(today).filter(n => n !== null));
  const max = Math.max(...daily.temperature_2m_max.slice(today).filter(n => n !== null));
  const position = (n: number) => max === min ? 50 : Math.max(0, Math.min(100, 100 * (n - min) / (max - min)));
  return <><section className={s.card}><h2>10-day forecast</h2>
    {daily.time.map((time, i) => {
      if (i < today) return null;
      const [icon, label] = condition(daily.weather_code[i]);
      const low = daily.temperature_2m_min[i], high = daily.temperature_2m_max[i];
      const rain = daily.precipitation_probability_max[i];
      return <button key={time} className={s.day} aria-haspopup="dialog" onClick={() => setSelected(time)}>
        <strong>{i === today ? "Today" : weekday.format((daily.sunrise[i] ?? time) * 1000)}</strong>
        <span className={s.symbol}><span role="img" aria-label={label} title={label}>{icon}</span>
          {rain != null && rain >= 20 && <small aria-label={rain + "% chance of precipitation"}>{rain}%</small>}
        </span>
        <span className={s.low}>{value(low, "°")}</span>
        <span className={s.track} aria-hidden="true">{low != null && high != null &&
          <i style={{ left: position(low) + "%", right: 100 - position(high) + "%", background: `linear-gradient(90deg,hsl(${hue(low)} 85% 67%),hsl(${hue(high)} 85% 67%))` }} />}
          {i === today && current.temperature_2m != null && low != null && high != null && <b style={{ left: position(current.temperature_2m) + "%" }} />}
        </span><strong>{value(high, "°")}</strong>
      </button>;
    })}
  </section>
    {selected !== null && daily.time.includes(selected) && <DayDetail forecast={forecast} day={daily.time.indexOf(selected)} today={today} onSelect={setSelected} onClose={() => setSelected(null)} />}
  </>;
}

function hue(temp: number) {
  return 230 - Math.min(1, Math.max(0, (temp - 10) / 85)) * 222;
}

export default function Weather() {
  const { forecast, failed, retry } = useForecast();
  const current = forecast?.current;
  const [icon, label] = condition(current?.weather_code ?? null, current?.is_day === 1);
  return <main className={s.sky} data-night={current?.is_day === 0}>
    <div className={s.wrap}><header className={s.hero}><p>New York City</p><h1>{weatherLocation.name}</h1>
      {current && <><div className={s.temp}>{value(current.temperature_2m, "°")}</div>
        <div><span aria-hidden="true">{icon}</span> {label}</div></>}
    </header>
    {failed ? <div className={s.status} role="status">{forecast ? "Couldn’t refresh the forecast." : "Couldn’t load the forecast."} <button onClick={retry}>Retry</button></div>
      : !forecast && <p className={s.status} role="status">Loading forecast…</p>}
    {forecast && <><Hourly forecast={forecast} /><Days forecast={forecast} />
      <footer>As of {clock.format(forecast.current.time * 1000)} NYC time · °F · <a href="https://open-meteo.com/">Open-Meteo</a></footer></>}
    </div></main>;
}
