"use client";

import { LAYOUT_OPTIONS } from "../_lib/constants";
import type { LayoutMode } from "../_lib/types";
import styles from "./Toolbar.module.css";

export default function LayoutControls({ value, onChange }: {
  value: LayoutMode;
  onChange: (layout: LayoutMode) => void;
}) {
  return (
    <div className={styles.group} role="group" aria-label="Market grid layout">
      {LAYOUT_OPTIONS.map((option) => (
        <button key={option.value} className={styles.button} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
