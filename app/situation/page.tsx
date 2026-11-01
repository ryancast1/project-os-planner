"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { LayoutMode, TimeRangeLabel, PanelSlot, SavedMarket, SavedView, OutcomeColors } from "./_lib/types";
import { LAYOUT_CONFIGS } from "./_lib/constants";
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
import ManageMarketsModal from "./_components/ManageMarketsModal";
import { useViewSwipe } from "./_lib/useViewSwipe";
import { ELECTION_NIGHT_LABEL, isElectionNightAvailable } from "./_lib/electionNight";
import type { MoverRange } from "./_lib/movers";
import "./tv.css";

export default function SituationDashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Markets watchlist
  const [savedMarkets, setSavedMarkets] = useState<SavedMarket[]>([]);

  // Current layout state
  const [layout, setLayout] = useState<LayoutMode>("1");
  const [panels, setPanels] = useState<PanelSlot[]>([null]);
  const [timeRange, setTimeRange] = useState<TimeRangeLabel>("1D");
  const [moverRange, setMoverRange] = useState<MoverRange | null>(null);
  const [moverCount, setMoverCount] = useState(0);

  // Views
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // UI
  const [manageOpen, setManageOpen] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const viewRevisionRef = useRef(0);

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
    saveLayout(local.layout);
    saveTimeRange(local.timeRange);

    (async () => {
      const uid = await getUserId();
      setUserId(uid);

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
      setAuthLoading(false);
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
      viewRevisionRef.current += 1;
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
      viewRevisionRef.current += 1;
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
    if (tr === ELECTION_NIGHT_LABEL) {
      if (!isElectionNightAvailable()) return;
    }
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

  // -- Apply market-wide color preferences without reloading chart data --
  const handleMarketColorsChange = useCallback((marketId: string, colors: OutcomeColors) => {
    setSavedMarkets((previous) => previous.map((market) => market.id === marketId
      ? { ...market, outcome_colors: colors }
      : market));
  }, []);

  // -- Load a saved view --
  const handleLoadView = useCallback(
    (view: SavedView) => {
      viewRevisionRef.current += 1;
      setViewError(null);
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
    if (!activeViewId || !userId) return false;
    const view = savedViews.find((v) => v.id === activeViewId);
    if (!view) return false;

    const revision = viewRevisionRef.current;
    const ok = await updateView(activeViewId, view.title, layout, panels);
    if (ok) {
      if (viewRevisionRef.current === revision) {
        setIsDirty(false);
        setViewError(null);
      }
      const views = await loadViews(userId);
      setSavedViews(views);
    } else {
      setViewError("Could not save this view. Please try again.");
    }
    return ok;
  }, [activeViewId, userId, savedViews, layout, panels]);

  // -- Create a new named view with current state --
  const handleCreateView = useCallback(
    async (title: string) => {
      if (!userId) return false;

      const revision = viewRevisionRef.current;
      const newView = await createView(userId, title, layout, panels);
      if (!newView) {
        setViewError("Could not create this view. Please try again.");
        return false;
      }
      setSavedViews((previous) => [...previous, newView]);
      if (viewRevisionRef.current === revision) {
        setActiveViewId(newView.id);
        saveActiveViewId(newView.id);
        setIsDirty(false);
        setViewError(null);
      }
      return true;
    },
    [userId, layout, panels]
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
    enabled: !authLoading && !isMobilePortrait && !manageOpen,
  });
  const denseLayout = layout === "7x4" && !isMobilePortrait;

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
      className={denseLayout
        ? "tv-dashboard bg-gradient-to-b from-black to-zinc-950 text-white flex flex-col h-dvh overflow-hidden"
        : `bg-gradient-to-b from-black to-zinc-950 px-3 md:px-4 py-3 text-white flex flex-col gap-2 ${isMobilePortrait ? "min-h-dvh overflow-y-auto" : "h-dvh overflow-hidden"}`}
    >
      <Header
        layout={layout}
        timeRange={timeRange}
        onLayoutChange={handleLayoutChange}
        onTimeRangeChange={handleTimeRangeChange}
        savedViews={savedViews}
        activeViewId={activeViewId}
        isDirty={isDirty}
        onLoadView={handleLoadView}
        onSaveView={handleSaveView}
        onCreateView={handleCreateView}
        onDeleteView={handleDeleteView}
        onManage={() => setManageOpen(true)}
        moverRange={moverRange}
        moverCount={moverCount}
        onMoverRangeChange={setMoverRange}
        mobilePortrait={isMobilePortrait}
      />

      {viewError && <p role="alert" className="shrink-0 text-sm text-amber-300">{viewError}</p>}

      <PanelGrid
        layout={layout}
        panels={panels}
        savedMarkets={savedMarkets}
        timeRange={timeRange}
        onChangeMarket={handleChangeMarket}
        onManageMarkets={() => setManageOpen(true)}
        mobilePortrait={isMobilePortrait}
        mobileLandscape={isMobileLandscape}
        moverRange={layout === "7x4" ? moverRange : null}
        onMoverCountChange={setMoverCount}
      />

      <ManageMarketsModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        savedMarkets={savedMarkets}
        userId={userId}
        onMarketsChange={handleMarketsChange}
        onMarketColorsChange={handleMarketColorsChange}
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
