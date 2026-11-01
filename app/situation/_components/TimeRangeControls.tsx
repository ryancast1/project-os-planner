"use client";

import { useEffect, useState } from "react";
import { TIME_RANGES } from "../_lib/constants";
import { ELECTION_NIGHT_LABEL, isElectionNightAvailable } from "../_lib/electionNight";
import type { TimeRangeLabel } from "../_lib/types";
import styles from "./Toolbar.module.css";

export default function TimeRangeControls({ value, onChange }: {
  value: TimeRangeLabel;
  onChange: (range: TimeRangeLabel) => void;
}) {
  const [available, setAvailable] = useState(() => isElectionNightAvailable());
  useEffect(() => {
    if (available) return;
    const check = () => setAvailable(isElectionNightAvailable());
    const timer = window.setInterval(check, 1000);
    window.addEventListener("focus", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, [available]);
  return (
    <div className={styles.group} role="group" aria-label="Chart time range">
      {TIME_RANGES.map((range) => (
        <button key={range.label} className={styles.button} aria-pressed={value === range.label} onClick={() => onChange(range.label)}>
          {range.label}
        </button>
      ))}
      <button
        className={styles.button}
        disabled={!available}
        aria-pressed={value === ELECTION_NIGHT_LABEL}
        title={available ? "Since November 3, 2026 at 6:00 p.m. ET, continuing past midnight" : "Available November 3, 2026 at 6:00 p.m. ET"}
        onClick={() => onChange(ELECTION_NIGHT_LABEL)}
      >
        {ELECTION_NIGHT_LABEL}
      </button>
    </div>
  );
}
