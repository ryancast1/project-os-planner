"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { LayoutMode, TimeRangeLabel, PanelSlot, SavedMarket, SavedView } from "./_lib/types";
import { LAYOUT_CONFIGS, LAYOUT_OPTIONS, TIME_RANGES } from "./_lib/constants";
import {
  loadLocalState,
  saveLayout,
  savePanels,
  saveTimeRange,
  loadActiveViewId,
  saveActiveViewId,
} from "./_lib/storage";
import { getUserId, loadSavedMarkets } from "./_lib/markets";
import { loadViews, createView, updateView, deleteView } from "./_lib/views";
import Header from "./_components/Header";
import PanelGrid from "./_components/PanelGrid";
import ViewsBar from "./_components/ViewsBar";
import ManageMarketsModal from "./_components/ManageMarketsModal";
import { useViewSwipe } from "./_lib/useViewSwipe";

export default function SituationDashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Markets watchlist
  const [savedMarkets, setSavedMarkets] = useState<SavedMarket[]>([]);

  // Current layout state
  const [layout, setLayout] = useState<LayoutMode>("1");
  const [panels, setPanels] = useState<PanelSlot[]>([null]);
  const [timeRange, setTimeRange] = useState<TimeRangeLabel>("1D");

  // Views
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // UI
  const [manageOpen, setManageOpen] = useState(false);

  // Portrait mobile: single-column scroll view
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait) and (max-width: 767px)");
    setIsMobilePortrait(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobilePortrait(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Landscape mobile: read-only grid — phones rotated sideways (≤500px tall)
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape) and (max-height: 500px)");
    setIsMobileLandscape(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobileLandscape(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // -- On mount: load localStorage + auth  saved markets + views --
  useEffect(() => {
    const local = loadLocalState();
    setLayout(local.layout);
    setPanels(local.panels);
    setTimeRange(local.timeRange);

    (async () => {
      const uid = await getUserId();
      setUserId(uid);
      setAuthLoading(false);

      if (uid) {
        const [markets, views] = await Promise.all([
          loadSavedMarkets(uid),
          loadViews(uid),
        ]);
        setSavedMarkets(markets);
        setSavedViews(views);

        // Restore last active view if it still exists
        const savedViewId = loadActiveViewId();
        if (savedViewId && views.some((v) => v.id === savedViewId)) {
          setActiveViewId(savedViewId);
        }

        // Reconcile panels: clear stale Polymarket IDs (built-ins are always valid)
        const marketIds = new Set(markets.map((m) => m.id));
        setPanels((prev) =>
          prev.map((slot) =>
            slot && !slot.startsWith("builtin:") && !marketIds.has(slot) ? null : slot
          )
        );
      }
    })();
  }, []);

  // -- Helper: reconcile panel slots against a set of valid market IDs --
  function reconcilePanels(rawPanels: PanelSlot[], marketIds: Set<string>): PanelSlot[] {
    return rawPanels.map((slot) =>
      slot && !slot.startsWith("builtin:") && !marketIds.has(slot) ? null : slot
    );
  }

  // -- Layout change --
  const handleLayoutChange = useCallback(
    (newLayout: LayoutMode) => {
      setLayout(newLayout);
      saveLayout(newLayout);

      const newCount = LAYOUT_CONFIGS[newLayout].panelCount;
      setPanels((prev) => {
        const next = [...prev];
        while (next.length < newCount) next.push(null);
        const trimmed = next.slice(0, newCount);
        savePanels(trimmed);
        return trimmed;
      });

      setIsDirty(true);
    },
    []
  );

  // -- Panel market change --
  const handleChangeMarket = useCallback(
    (slotIndex: number, marketId: string | null) => {
      setPanels((prev) => {
        const next = [...prev];
        next[slotIndex] = marketId;
        savePanels(next);
        return next;
      });
      setIsDirty(true);
    },
    []
  );

  // -- Time range change (doesn't dirty a view — it's a display pref) --
  const handleTimeRangeChange = useCallback((tr: TimeRangeLabel) => {
    setTimeRange(tr);
    saveTimeRange(tr);
  }, []);

  // -- Markets changed (add/remove in modal) --
  const handleMarketsChange = useCallback(async () => {
    if (!userId) return;
    const markets = await loadSavedMarkets(userId);
    setSavedMarkets(markets);

    const ids = new Set(markets.map((m) => m.id));
    setPanels((prev) => {
      const next = reconcilePanels(prev, ids);
      savePanels(next);
      return next;
    });
  }, [userId]);

  // -- Load a saved view --
  const handleLoadView = useCallback(
    (view: SavedView) => {
      setActiveViewId(view.id);
      saveActiveViewId(view.id);
      setIsDirty(false);
      setLayout(view.layout);
      saveLayout(view.layout);

      // Reconcile against current market list, then size to layout
      const ids = new Set(savedMarkets.map((m) => m.id));
      const cleaned = reconcilePanels(view.panels, ids);
      const expected = LAYOUT_CONFIGS[view.layout].panelCount;
      const sized = [...cleaned];
      while (sized.length < expected) sized.push(null);
      const trimmed = sized.slice(0, expected);

      setPanels(trimmed);
      savePanels(trimmed);
    },
    [savedMarkets]
  );

  // -- Save current state over the active view --
  const handleSaveView = useCallback(async () => {
    if (!activeViewId || !userId) return;
    const view = savedViews.find((v) => v.id === activeViewId);
    if (!view) return;

    // Capture current state synchronously via setState read trick
    let snapshotPanels: PanelSlot[] = [];
    setPanels((prev) => { snapshotPanels = prev; return prev; });
    let snapshotLayout: LayoutMode = "1";
    setLayout((prev) => { snapshotLayout = prev; return prev; });

    const ok = await updateView(activeViewId, view.title, snapshotLayout, snapshotPanels);
    if (ok) {
      setIsDirty(false);
      const views = await loadViews(userId);
      setSavedViews(views);
    }
  }, [activeViewId, userId, savedViews]);

  // -- Create a new named view with current state --
  const handleCreateView = useCallback(
    async (title: string) => {
      if (!userId) return;

      let snapshotPanels: PanelSlot[] = [];
      setPanels((prev) => { snapshotPanels = prev; return prev; });
      let snapshotLayout: LayoutMode = "1";
      setLayout((prev) => { snapshotLayout = prev; return prev; });

      const newView = await createView(userId, title, snapshotLayout, snapshotPanels);
      if (newView) {
        const views = await loadViews(userId);
        setSavedViews(views);
        setActiveViewId(newView.id);
        saveActiveViewId(newView.id);
        setIsDirty(false);
      }
    },
    [userId]
  );

  // -- Delete a view --
  const handleDeleteView = useCallback(
    async (id: string) => {
      const ok = await deleteView(id);
      if (ok && userId) {
        const views = await loadViews(userId);
        setSavedViews(views);
        if (activeViewId === id) {
          setActiveViewId(null);
          saveActiveViewId(null);
          setIsDirty(false);
        }
      }
    },
    [userId, activeViewId]
  );

  // -- Swipe between saved views (desktop trackpad + iPhone landscape) --
  const { containerRef: swipeRef, transitionLabel } = useViewSwipe({
    savedViews,
    activeViewId,
    onSwitchView: handleLoadView,
    enabled: !isMobilePortrait && !manageOpen,
  });

  // -- Auth loading --
  if (authLoading) {
    return (
      <main className="min-h-dvh bg-gradient-to-b from-black to-zinc-950 text-white flex items-center justify-center">
        <p className="text-white/50">Loading...</p>
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="min-h-dvh bg-gradient-to-b from-black to-zinc-950 text-white flex flex-col items-center justify-center px-6 gap-4">
        <h1 className="text-2xl font-bold">Situation</h1>
        <p className="text-white/50 text-center max-w-sm">
          Sign in to save and sync your market watchlist across devices.
        </p>
      </main>
    );
  }

  return (
    <main
      ref={swipeRef}
      className={`bg-gradient-to-b from-black to-zinc-950 px-3 md:px-4 py-3 text-white flex flex-col gap-2 ${isMobilePortrait ? "min-h-dvh overflow-y-auto" : "h-dvh overflow-hidden"}`}
    >
      {/* Header: 3-row stacked on portrait mobile, single row otherwise */}
      {isMobilePortrait ? (
        <div className="shrink-0 flex flex-col gap-1.5">
          {/* Row 1: Grid type (layout picker) */}
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="text-xs text-white/50 hover:text-white/80 transition mr-1 shrink-0"
            >
              &larr; Home
            </Link>
            <span className="shrink-0 text-white/10 text-xs select-none">|</span>
            <div className="flex items-center gap-0.5">
              {LAYOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleLayoutChange(opt.value)}
                  className={`px-2 py-0.5 text-[10px] rounded-md transition ${
                    layout === opt.value
                      ? "bg-white/15 text-white"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Time scale */}
          <div className="flex items-center gap-0.5">
            {TIME_RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => handleTimeRangeChange(r.label)}
                className={`px-2 py-0.5 text-[10px] rounded-md transition ${
                  timeRange === r.label
                    ? "bg-white/15 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Row 3: Views dropdown/saver + Manage */}
          <div className="flex items-center gap-1">
            <ViewsBar
              savedViews={savedViews}
              activeViewId={activeViewId}
              isDirty={isDirty}
              onLoadView={handleLoadView}
              onSaveView={handleSaveView}
              onCreateView={handleCreateView}
              onDeleteView={handleDeleteView}
            />
            <div className="flex-1" />
            <button
              onClick={() => setManageOpen(true)}
              className="shrink-0 text-xs text-white/50 hover:text-white/80 transition"
            >
              Manage
            </button>
          </div>
        </div>
      ) : (
        /* Desktop / landscape: single row */
        <div className="shrink-0 flex items-center gap-1 md:gap-1.5">
          <Header
            layout={layout}
            timeRange={timeRange}
            onLayoutChange={handleLayoutChange}
            onTimeRangeChange={handleTimeRangeChange}
          />

          <span className="shrink-0 text-white/10 text-xs select-none">|</span>

          <ViewsBar
            savedViews={savedViews}
            activeViewId={activeViewId}
            isDirty={isDirty}
            onLoadView={handleLoadView}
            onSaveView={handleSaveView}
            onCreateView={handleCreateView}
            onDeleteView={handleDeleteView}
          />

          <div className="flex-1" />

          <button
            onClick={() => setManageOpen(true)}
            className="shrink-0 text-xs text-white/50 hover:text-white/80 transition"
          >
            Manage
          </button>
        </div>
      )}

      <PanelGrid
        layout={layout}
        panels={panels}
        savedMarkets={savedMarkets}
        timeRange={timeRange}
        onChangeMarket={handleChangeMarket}
        onManageMarkets={() => setManageOpen(true)}
        mobilePortrait={isMobilePortrait}
        mobileLandscape={isMobileLandscape}
      />

      <ManageMarketsModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        savedMarkets={savedMarkets}
        userId={userId}
        onMarketsChange={handleMarketsChange}
      />
      {/* View-switch toast */}
      {transitionLabel && (
        <div className="fixed inset-x-0 top-12 flex justify-center z-40 pointer-events-none">
          <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-lg px-4 py-2 text-sm text-white/80 view-switch-toast">
            {transitionLabel}
          </div>
        </div>
      )}
    </main>
  );
}
