"use client";

import { useEffect, useState } from "react";
import type { TimeRangeLabel } from "../_lib/types";
import { TIME_RANGES } from "../_lib/constants";
import { ELECTION_NIGHT_LABEL, isElectionNightAvailable } from "../_lib/electionNight";

export default function TVToolbar({
  timeRange,
  editing,
  isDirty,
  assignedCount,
  onTimeRangeChange,
  onToggleEditing,
  onSave,
  onBack,
  onManage,
}: {
  timeRange: TimeRangeLabel;
  editing: boolean;
  isDirty: boolean;
  assignedCount: number;
  onTimeRangeChange: (range: TimeRangeLabel) => void;
  onToggleEditing: () => void;
  onSave: () => Promise<boolean>;
  onBack: () => void;
  onManage: () => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [electionNightAvailable, setElectionNightAvailable] = useState(() => isElectionNightAvailable());

  useEffect(() => {
    if (electionNightAvailable) return;
    const checkStart = () => setElectionNightAvailable(isElectionNightAvailable());
    const timer = window.setInterval(checkStart, 1000);
    window.addEventListener("focus", checkStart);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkStart);
    };
  }, [electionNightAvailable]);

  useEffect(() => {
    const handleChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  async function toggleFullscreen() {
    setMessage(null);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else {
        setMessage("Use your browser's fullscreen option on this device.");
      }
    } catch {
      setMessage("Fullscreen could not start. Try your browser's fullscreen option.");
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      if (!(await onSave())) setMessage("Could not save. Please try again.");
    } catch {
      setMessage("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <header className="tv-toolbar">
      <button onClick={onBack} className="tv-control">&larr; Back</button>
      <div className="tv-board-label">
        <h1>TV</h1>
        <span>{assignedCount}/28 markets</span>
      </div>
      <span className="tv-refresh-label"><span />Auto-refresh</span>
      <div className="tv-time-ranges" aria-label="Chart time range">
        {TIME_RANGES.map((range) => (
          <button
            key={range.label}
            onClick={() => onTimeRangeChange(range.label)}
            aria-pressed={timeRange === range.label}
            className="tv-control"
          >
            {range.label}
          </button>
        ))}
        <button
          onClick={() => onTimeRangeChange(ELECTION_NIGHT_LABEL)}
          disabled={!electionNightAvailable}
          aria-pressed={timeRange === ELECTION_NIGHT_LABEL}
          title={electionNightAvailable
            ? "Since November 3, 2026 at 7:00 p.m. ET, continuing past midnight"
            : "Available November 3, 2026 at 7:00 p.m. ET"}
          className="tv-control tv-election-night"
        >
          {ELECTION_NIGHT_LABEL}
        </button>
      </div>
      <div className="tv-board-actions">
        <button onClick={onToggleEditing} aria-pressed={editing} className="tv-control" disabled={saving}>
          {editing ? "Done editing" : "Edit markets"}
        </button>
        <button onClick={save} disabled={saving} className="tv-control tv-save" data-dirty={isDirty}>
          {saving ? "Saving..." : isDirty ? "Save TV*" : "Saved"}
        </button>
        <button onClick={onManage} className="tv-control">Manage</button>
        <button onClick={toggleFullscreen} aria-pressed={fullscreen} className="tv-control">
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>
      {message && <p role="status" className="tv-toolbar-message">{message}</p>}
    </header>
  );
}
