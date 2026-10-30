"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import type { LayoutMode, TimeRangeLabel, PanelSlot, SavedMarket, SavedView, OutcomeColors } from "./_lib/types";
import { LAYOUT_CONFIGS, LAYOUT_OPTIONS, TIME_RANGES } from "./_lib/constants";
import {
  loadLocalState,
  saveLayout,
  savePanels,
  saveTimeRange,
  loadActiveViewId,
  saveActiveViewId,
  loadTVElectionNight,
  saveTVElectionNight,
} from "./_lib/storage";
import { getUserId, loadSavedMarkets } from "./_lib/markets";
import { loadViews, createView, updateView, deleteView } from "./_lib/views";
import Header from "./_components/Header";
import PanelGrid from "./_components/PanelGrid";
import ViewsBar from "./_components/ViewsBar";
import ManageMarketsModal from "./_components/ManageMarketsModal";
import { useViewSwipe } from "./_lib/useViewSwipe";
import { createTVPanels } from "./_lib/tv";
import TVToolbar from "./_components/TVToolbar";
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
  const [tvElectionNight, setTVElectionNight] = useState(false);
  const [moverRange, setMoverRange] = useState<MoverRange | null>(null);
  const [moverCount, setMoverCount] = useState(0);
  const chartTimeRange = layout === "TV" && tvElectionNight ? ELECTION_NIGHT_LABEL : timeRange;

  // Views
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // UI
  const [manageOpen, setManageOpen] = useState(false);
  const [tvOpening, setTVOpening] = useState(false);
  const [tvEditing, setTVEditing] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const viewRevisionRef = useRef(0);
  const previousViewRef = useRef<{
    layout: LayoutMode;
    panels: PanelSlot[];
    activeViewId: string | null;
    isDirty: boolean;
  } | null>(null);

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
    setTVElectionNight(loadTVElectionNight());

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
      if (layout !== "TV" || !isElectionNightAvailable()) return;
      setTVElectionNight(true);
      saveTVElectionNight(true);
      return;
    }
    if (layout === "TV") {
      setTVElectionNight(false);
      saveTVElectionNight(false);
    }
    setTimeRange(tr);
    saveTimeRange(tr);
  }, [layout]);

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
      if (view.layout === "TV" && layout !== "TV") {
        previousViewRef.current = { layout, panels, activeViewId, isDirty };
      }
      setTVEditing(false);
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
    [savedMarkets, layout, panels, activeViewId, isDirty]
  );

  const handleOpenTV = useCallback(async () => {
    if (!userId || tvOpening) return;
    const existing = savedViews.find((view) => view.layout === "TV");
    if (existing) {
      handleLoadView(existing);
      return;
    }

    setTVOpening(true);
    setViewError(null);
    try {
      const view = await createView(userId, "TV", "TV", createTVPanels(panels, savedMarkets));
      if (!view) {
        setViewError("Could not create the TV view. Please try again.");
        return;
      }
      setSavedViews((previous) => [...previous, view]);
      handleLoadView(view);
      setTVEditing(true);
    } catch {
      setViewError("Could not create the TV view. Please try again.");
    } finally {
      setTVOpening(false);
    }
  }, [userId, tvOpening, savedViews, panels, savedMarkets, handleLoadView]);

  const handleExitTV = useCallback(() => {
    viewRevisionRef.current += 1;
    const previous = previousViewRef.current ?? {
      layout: "4x2" as const,
      panels: panels.slice(0, LAYOUT_CONFIGS["4x2"].panelCount),
      activeViewId: null,
      isDirty: true,
    };
    setLayout(previous.layout);
    saveLayout(previous.layout);
    const validIds = new Set(savedMarkets.map((market) => market.id));
    const restoredPanels = reconcilePanels(previous.panels, validIds);
    setPanels(restoredPanels);
    savePanels(restoredPanels);
    setActiveViewId(previous.activeViewId);
    saveActiveViewId(previous.activeViewId);
    setIsDirty(previous.isDirty);
    setViewError(null);
    previousViewRef.current = null;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [panels, savedMarkets]);

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
      if (!userId) return;

      const newView = await createView(userId, title, layout, panels);
      if (newView) {
        const views = await loadViews(userId);
        setSavedViews(views);
        setActiveViewId(newView.id);
        saveActiveViewId(newView.id);
        setIsDirty(false);
      }
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
    enabled: !isMobilePortrait && !manageOpen && layout !== "TV",
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
      className={layout === "TV"
        ? "tv-dashboard bg-gradient-to-b from-black to-zinc-950 text-white flex flex-col h-dvh overflow-hidden"
        : `bg-gradient-to-b from-black to-zinc-950 px-3 md:px-4 py-3 text-white flex flex-col gap-2 ${isMobilePortrait ? "min-h-dvh overflow-y-auto" : "h-dvh overflow-hidden"}`}
    >
      {/* Header: 3-row stacked on portrait mobile, single row otherwise */}
      {layout === "TV" ? (
        <TVToolbar
          moverRange={moverRange}
          moverCount={moverCount}
          onMoverRangeChange={setMoverRange}
          timeRange={chartTimeRange}
          editing={tvEditing}
          isDirty={isDirty}
          assignedCount={panels.filter(Boolean).length}
          onTimeRangeChange={handleTimeRangeChange}
          onToggleEditing={() => setTVEditing((value) => !value)}
          onSave={handleSaveView}
          onBack={handleExitTV}
          onManage={() => setManageOpen(true)}
        />
      ) : isMobilePortrait ? (
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
            onOpenTV={handleOpenTV}
            tvOpening={tvOpening}
          />

          <div className="flex-1" />

          <button
            onClick={handleOpenTV}
            disabled={tvOpening}
            className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15 transition disabled:opacity-50"
            title="Open the 28-market TV board"
          >
            {tvOpening ? "Opening..." : "TV"}
          </button>

          <button
            onClick={() => setManageOpen(true)}
            className="shrink-0 text-xs text-white/50 hover:text-white/80 transition"
          >
            Manage
          </button>
        </div>
      )}

      {viewError && <p role="alert" className="shrink-0 text-sm text-amber-300">{viewError}</p>}

      <PanelGrid
        layout={layout}
        panels={panels}
        savedMarkets={savedMarkets}
        timeRange={chartTimeRange}
        onChangeMarket={handleChangeMarket}
        onManageMarkets={() => setManageOpen(true)}
        mobilePortrait={isMobilePortrait}
        mobileLandscape={isMobileLandscape}
        tvEditing={tvEditing}
        moverRange={layout === "TV" ? moverRange : null}
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
