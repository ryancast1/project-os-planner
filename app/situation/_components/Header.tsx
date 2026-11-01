"use client";

import Link from "next/link";
import type { LayoutMode, SavedView, TimeRangeLabel } from "../_lib/types";
import type { MoverRange } from "../_lib/movers";
import LayoutControls from "./LayoutControls";
import TimeRangeControls from "./TimeRangeControls";
import MoversControls from "./MoversControls";
import ViewsBar from "./ViewsBar";
import styles from "./Toolbar.module.css";

export default function Header({
  layout,
  timeRange,
  onLayoutChange,
  onTimeRangeChange,
  savedViews,
  activeViewId,
  isDirty,
  onLoadView,
  onSaveView,
  onCreateView,
  onDeleteView,
  onManage,
  moverRange,
  moverCount,
  onMoverRangeChange,
  mobilePortrait,
}: {
  layout: LayoutMode;
  timeRange: TimeRangeLabel;
  onLayoutChange: (l: LayoutMode) => void;
  onTimeRangeChange: (t: TimeRangeLabel) => void;
  savedViews: SavedView[];
  activeViewId: string | null;
  isDirty: boolean;
  onLoadView: (view: SavedView) => void;
  onSaveView: () => Promise<boolean>;
  onCreateView: (title: string) => Promise<boolean>;
  onDeleteView: (id: string) => Promise<void>;
  onManage: () => void;
  moverRange: MoverRange | null;
  moverCount: number;
  onMoverRangeChange: (range: MoverRange | null) => void;
  mobilePortrait: boolean;
}) {
  return (
    <header className={`${styles.toolbar} ${mobilePortrait ? styles.portrait : ""}`} data-no-view-swipe>
      <Link href="/" className={styles.home} aria-label="Home">
        <span aria-hidden="true">&larr;</span><span className={styles.homeName}>Home</span>
      </Link>
      <LayoutControls value={layout} onChange={onLayoutChange} />
      <div className={styles.timeAndMovers}>
        <TimeRangeControls value={timeRange} onChange={onTimeRangeChange} />
        {layout === "7x4" && !mobilePortrait && (
          <MoversControls value={moverRange} count={moverCount} onChange={onMoverRangeChange} />
        )}
      </div>
      <div className={styles.actions}>
        <ViewsBar
          savedViews={savedViews}
          activeViewId={activeViewId}
          isDirty={isDirty}
          onLoadView={onLoadView}
          onSaveView={onSaveView}
          onCreateView={onCreateView}
          onDeleteView={onDeleteView}
        />
        <button className={`${styles.button} ${styles.action}`} onClick={onManage}>Manage</button>
      </div>
    </header>
  );
}
