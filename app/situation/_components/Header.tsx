"use client";

import Link from "next/link";
import type { LayoutMode, TimeRangeLabel } from "../_lib/types";
import { TIME_RANGES, LAYOUT_OPTIONS } from "../_lib/constants";

export default function Header({
  layout,
  timeRange,
  onLayoutChange,
  onTimeRangeChange,
}: {
  layout: LayoutMode;
  timeRange: TimeRangeLabel;
  onLayoutChange: (l: LayoutMode) => void;
  onTimeRangeChange: (t: TimeRangeLabel) => void;
}) {
  return (
    <>
      {/* Home */}
      <Link
        href="/"
        className="shrink-0 text-xs text-white/50 hover:text-white/80 transition mr-1"
      >
        &larr; Home
      </Link>

      <span className="shrink-0 text-white/10 text-xs select-none">|</span>

      {/* Layout picker */}
      <div className="flex items-center gap-0.5">
        {LAYOUT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onLayoutChange(opt.value)}
            className={`px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs rounded-md transition ${
              layout === opt.value
                ? "bg-white/15 text-white"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <span className="shrink-0 text-white/10 text-xs select-none">|</span>

      {/* Time range */}
      <div className="flex items-center gap-0.5">
        {TIME_RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => onTimeRangeChange(r.label)}
            className={`px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs rounded-md transition ${
              timeRange === r.label
                ? "bg-white/15 text-white"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </>
  );
}
