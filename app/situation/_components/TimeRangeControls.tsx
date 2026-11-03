"use client";

import { useEffect, useState } from "react";
import { TIME_RANGES } from "../_lib/constants";
import { ELECTION_DAY_START_TS, ELECTION_NIGHT_LABEL, ELECTION_NIGHT_START_TS, getElectionNightStartTs, isElectionNightAvailable } from "../_lib/electionNight";
import type { TimeRangeLabel } from "../_lib/types";
import styles from "./Toolbar.module.css";

export default function TimeRangeControls({ value, onChange }: {
  value: TimeRangeLabel;
  onChange: (range: TimeRangeLabel) => void;
}) {
  const [startTs, setStartTs] = useState(() => isElectionNightAvailable() ? getElectionNightStartTs() : null);
  const available = startTs !== null;
  useEffect(() => {
    if (startTs === ELECTION_NIGHT_START_TS) return;
    const check = () => {
      const now = Date.now();
      setStartTs(isElectionNightAvailable(now) ? getElectionNightStartTs(now) : null);
    };
    const timer = window.setInterval(check, 1000);
    window.addEventListener("focus", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, [startTs]);
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
        title={startTs === ELECTION_DAY_START_TS
          ? "Since November 3, 2026 at 7:00 a.m. ET; switches to since 6:00 p.m. ET at 6:00 p.m."
          : available
          ? "Since November 3, 2026 at 6:00 p.m. ET, continuing past midnight"
          : "Available November 3, 2026 at 7:00 a.m. ET; switches to since 6:00 p.m. ET that evening"}
        onClick={() => onChange(ELECTION_NIGHT_LABEL)}
      >
        {ELECTION_NIGHT_LABEL}
      </button>
    </div>
  );
}
