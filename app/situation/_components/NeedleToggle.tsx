"use client";

import styles from "./Toolbar.module.css";

export default function NeedleToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`${styles.button} ${styles.action}`} aria-label="Needle mode" aria-pressed={enabled}
      title={`${enabled ? "Show charts" : "Show needles"}. Gauges use Polymarket odds, not NYT forecasts.`} onClick={onToggle}>
      <svg width="1.4em" height="1.4em" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M 3 22 A 11 11 0 0 1 25 22 H 3 Z" stroke="currentColor" strokeWidth="1.4" />
        <path d="M 11.7 22 L 9.5 7 L 15.8 20.9 Z" fill="currentColor" />
        <circle cx="14" cy="22" r="2.2" fill="currentColor" stroke="#101112" strokeWidth="1" />
      </svg>
    </button>
  );
}
