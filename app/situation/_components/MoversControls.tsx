"use client";

import { MOVER_MAX_HIGHLIGHTS, MOVER_MIN_CHANGE, MOVER_RANGES, type MoverRange } from "../_lib/movers";
import styles from "./Toolbar.module.css";

export default function MoversControls({ value, count, onChange }: {
  value: MoverRange | null;
  count: number;
  onChange: (range: MoverRange | null) => void;
}) {
  return (
    <div className={`${styles.group} ${styles.movers}`} role="group" aria-label="Movers">
      <span className={styles.caption}>Movers</span>
      {MOVER_RANGES.map((option) => (
        <button
          key={option.value}
          className={styles.button}
          aria-label={`Movers: ${option.label}`}
          aria-pressed={value === option.value}
          title={`Highlight up to ${MOVER_MAX_HIGHLIGHTS} displayed markets over ${option.label}, with a minimum move of ${MOVER_MIN_CHANGE} percentage points (cents) for prediction markets or ${MOVER_MIN_CHANGE}% for other prices. Markets with more than 3 outcomes are excluded. Click again to turn off. Updates every 30 seconds.`}
          onClick={() => onChange(value === option.value ? null : option.value)}
        >
          {option.label}
        </button>
      ))}
      {value && (
        <span role="status" className={styles.status} aria-label={count > 0 ? `${count} markets highlighted` : "No qualifying moves yet"} title={`Requires at least ${MOVER_MIN_CHANGE} percentage points of movement (${MOVER_MIN_CHANGE}% for other prices). Markets without reliable recent comparisons are skipped. Try a longer window if no markets qualify.`}>
          {count}/{MOVER_MAX_HIGHLIGHTS}
        </span>
      )}
    </div>
  );
}
