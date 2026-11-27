"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { condition, weatherLocation, type Forecast } from "@/lib/weather";
import Attribution from "./Attribution";
import s from "./day-detail.module.css";

const metrics = {
  temperature_2m: ["Temperature", "°F"],
  precipitation_probability: ["Precip. chance", "%"],
  precipitation: ["Precip. amount", " in"],
  wind_speed_10m: ["Wind", " mph"],
  relative_humidity_2m: ["Humidity", "%"],
  dew_point_2m: ["Dew point", "°F"],
} as const;
type Metric = keyof typeof metrics;
const format = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: weatherLocation.timezone });
const date = format({ month: "long", day: "numeric", weekday: "long" });
const hour = format({ hour: "numeric" });
const clock = format({ hour: "numeric", minute: "2-digit" });
const read = (value: number | null, metric: Metric) => value == null ? "—" :
  (metric === "precipitation" ? value.toFixed(2) : Math.round(value)) + metrics[metric][1];

export default function DayDetail({ forecast, day, today, planner = false, onSelect, onClose }: {
  forecast: Forecast; day: number; today: number; planner?: boolean; onSelect: (time: number) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    heading.current?.focus({ preventScroll: true });
    return () => el.close();
  }, []);
  const [metric, setMetric] = useState<Metric>("temperature_2m");
  const { hourly, daily, current } = forecast;
  const dayTitle = date.format((daily.sunrise[day] ?? daily.time[day]) * 1000);
  const hours = hourly.time.flatMap((time, index) =>
    date.format(time * 1000) === dayTitle ? [{ time, index }] : []);
  const currentHour = hours.findLastIndex(h => h.time <= current.time);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const selected = Math.min(selectedHour ?? Math.max(currentHour, 0), hours.length - 1);
  const index = hours[selected]?.index;
  const series = hours.map(h => hourly[metric][h.index]);
  const wind = metric === "wind_speed_10m";
  const gusts = wind ? hours.map(h => hourly.wind_gusts_10m?.[h.index] ?? null) : [];
  const gust = gusts[selected];
  const values = series.concat(gusts).filter(v => v !== null);
  const percent = metrics[metric][1] === "%";
  const degrees = metrics[metric][1] === "°F";
  const step = degrees ? 8 : metric === "precipitation" ? 0.04 : 4;
  const bottom = degrees && values.length ? Math.floor(Math.min(...values) / step) * step : 0;
  const top = percent ? 100 : Math.max(bottom + step, Math.ceil(Math.max(...values) / step) * step);
  const x = (i: number) => 12 + 350 * i / Math.max(1, hours.length - 1);
  const y = (v: number) => 184 - (v - bottom) / (top - bottom) * 138;
  const [icon, label] = condition(hourly.weather_code[index], hourly.is_day[index] === 1);
  const pathFor = (samples: (number | null)[]) => samples.map((v, i) => v == null ? "" :
    (samples[i - 1] == null ? "M" : "L") + x(i) + " " + y(v)).join(" ");
  const line = pathFor(series);
  const areas = line.trim().split(/(?=M)/).filter(Boolean).map(segment => {
    const coordinates = segment.trim().slice(1).split(/[ML]/);
    const firstX = coordinates[0].trim().split(" ")[0];
    const lastX = coordinates.at(-1)!.trim().split(" ")[0];
    return segment + " L" + lastX + " 184 L" + firstX + " 184 Z";
  });
  const activeValue = series[selected];
  const nowX = dayTitle === date.format(current.time * 1000) && hours.length ? x((current.time - hours[0].time) / 3600) : null;
  const lastHour = Math.max(0, hours.length - 1);
  function inspectHour(event: PointerEvent<SVGSVGElement>) {
    if (!event.isPrimary || !hours.length) return;
    const svg = event.currentTarget;
    const bounds = svg.getBoundingClientRect();
    const chartX = (event.clientX - bounds.left) / bounds.width * svg.viewBox.baseVal.width;
    const nearest = Math.round((chartX - x(0)) / (x(1) - x(0)));
    setSelectedHour(Math.max(0, Math.min(lastHour, nearest)));
  }
  return <dialog ref={dialog} className={s.detail} aria-labelledby="weather-day-title" onCancel={onClose}>
    <header className={s.header}>
      <button className={s.arrow} aria-label={day === today ? "View yesterday" : "Previous day"} title={day === today ? "View yesterday" : "Previous day"} disabled={day === 0}
        onClick={() => onSelect(daily.time[day - 1])}><span aria-hidden="true">‹</span>{day === today && <small>Yesterday</small>}</button>
      <h2 ref={heading} tabIndex={-1} id="weather-day-title" aria-live="polite">{dayTitle}</h2>
      <button className={s.arrow} aria-label="Next day" disabled={day === daily.time.length - 1}
        onClick={() => onSelect(daily.time[day + 1])}>›</button>
      <button className={s.close} aria-label="Close daily forecast" onClick={onClose}>×</button>
    </header>
    {planner && <p className={s.synopsis}>
      {condition(daily.weather_code[day])[1]} · High {read(daily.temperature_2m_max[day], "temperature_2m")} · Low {read(daily.temperature_2m_min[day], "temperature_2m")}
      {daily.precipitation_probability_max[day] != null && <> · {daily.precipitation_probability_max[day]}% chance of precipitation</>}
    </p>}
    <select className={s.metricSelect} aria-label="Chart metric" value={metric}
      onChange={event => setMetric(event.target.value as Metric)}>
      {(Object.keys(metrics) as Metric[]).map(m => <option key={m} value={m}>{metrics[m][0]}</option>)}
    </select>
    <p className={s.detailTime}>{hours[selected] && hour.format(hours[selected].time * 1000)} · {metrics[metric][0]}</p>
    <p className={s.reading}>{read(activeValue, metric)} <span title={label} role="img" aria-label={label}>{icon}</span></p>
    {wind && <div className={s.windLegend}>
      <span>Sustained</span><span>Gusts {read(gust, metric)}</span>
    </div>}
    <p className={s.detailSub}>{metric === "relative_humidity_2m" || metric === "dew_point_2m"
      ? <>Humidity {read(hourly.relative_humidity_2m[index], "relative_humidity_2m")} · Dew point {read(hourly.dew_point_2m[index], "dew_point_2m")}</>
      : !planner && !wind && <>High {read(daily.temperature_2m_max[day], "temperature_2m")} · Low {read(daily.temperature_2m_min[day], "temperature_2m")}</>}</p>
    <svg className={s.plot} viewBox="0 0 413 211" role="slider" tabIndex={hours.length ? 0 : -1}
      aria-label={metrics[metric][0] + " by hour, " + dayTitle}
      aria-valuemin={0} aria-valuemax={lastHour} aria-valuenow={Math.max(0, selected)}
      aria-valuetext={hours[selected] && clock.format(hours[selected].time * 1000) + ", " + read(activeValue, metric) + (wind ? ", gusts " + read(gust, metric) : "")}
      onPointerDown={event => {
        if (!event.isPrimary) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        inspectHour(event);
      }}
      onPointerMove={event => {
        if (event.pointerType === "mouse" || event.currentTarget.hasPointerCapture(event.pointerId)) inspectHour(event);
      }}
      onKeyDown={event => {
        const targets: Record<string, number> = {
          ArrowLeft: selected - 1, ArrowDown: selected - 1, ArrowRight: selected + 1,
          ArrowUp: selected + 1, Home: 0, End: lastHour,
        };
        if (event.key in targets) {
          event.preventDefault();
          setSelectedHour(Math.max(0, Math.min(lastHour, targets[event.key])));
        }
      }}>
      <defs><linearGradient id="weather-fill" x2="0%" y2="100%">
        <stop stopColor="#75d6ec" stopOpacity=".36" /><stop offset="100%" stopColor="#4e9cdd" stopOpacity=".08" />
      </linearGradient></defs>
      {metric !== "precipitation" && <path d={areas.join(" ")} fill="url(#weather-fill)" />}
      {Array.from({ length: 5 }, (_, tick) => {
        const v = bottom + tick * (top - bottom) / 4;
        return <g key={tick}><path d={`M12 ${y(v)} H364`} className={s.gridline} />
          <text x="369" y={y(v) + 4}>{read(v, metric)}</text></g>;
      })}
      {hours.map(({ time, index: i }, j) => {
        const h = hour.format(time * 1000);
        const [hourIcon, conditions] = condition(hourly.weather_code[i], hourly.is_day[i] === 1);
        return <g key={time}><text x={x(j)} y="25" textAnchor="middle">
          <title>{h} · {conditions}</title>{hourIcon}
        </text>
          {["12 AM","6 AM","12 PM","6 PM"].includes(h) && <>
            <path d={`M${x(j)} 45 V184`} className={s.gridline} strokeDasharray="3 4" />
            <text x={x(j)} y="201" textAnchor={j === 0 ? "start" : "middle"}>{h}</text></>}</g>;
      })}
      {nowX !== null && nowX <= x(hours.length - 1) && <path d={`M${nowX} 36 V184`} stroke="#a1aec2" strokeDasharray="3 4" />}
      {metric === "precipitation" ? series.map((v, i) => v == null ? null :
        <rect key={i} x={x(i) - 4} y={y(v)} width="8" height={184 - y(v)} fill="#78d8f3" />)
        : <path d={line} fill="none" stroke="#78d8f3" strokeWidth="3.5" strokeLinejoin="round" />}
      {wind && <path d={pathFor(gusts)} fill="none" stroke="#ffc487" strokeWidth="2.4" strokeDasharray="5 3" />}
      {gust != null && <circle cx={x(selected)} cy={y(gust)} r="3" fill="#ffc487" />}
      {selectedHour != null && hours.length > 0 && <path d={`M${x(selected)} 36 V184`} stroke="#ffffff77" />}
      {activeValue != null && <circle cx={x(selected)} cy={y(activeValue)} r="4.5" fill="white" stroke="#24405a" strokeWidth="2" />}
    </svg>
    {!values.length && <p>Hourly data unavailable for this metric.</p>}
    <div className={s.sun}>{(["sunrise", "sunset"] as const).map(event => {
      const time = daily[event][day];
      return <div key={event}><span>{event}</span><strong>{time == null ? "—" : clock.format(time * 1000)}</strong></div>;
    })}</div>
    {forecast.appleAttribution && <footer className="mt-3"><Attribution forecast={forecast} /></footer>}
  </dialog>;
}
