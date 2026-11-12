"use client";

import { TIME_RANGES } from "../_lib/constants";
import type { TimeRangeLabel } from "../_lib/types";
import styles from "./Toolbar.module.css";

export default function TimeRangeControls({ value, onChange }: {
  value: TimeRangeLabel;
  onChange: (range: TimeRangeLabel) => void;
}) {
  return (
    <div className={styles.group} role="group" aria-label="Chart time range">
      {TIME_RANGES.map((range) => (
        <button key={range.label} className={styles.button} aria-pressed={value === range.label} onClick={() => onChange(range.label)}>
          {range.label}
        </button>
      ))}
    </div>
  );
}
