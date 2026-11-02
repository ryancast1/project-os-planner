"use client";

import { memo, useEffect, useState, useRef, useCallback, type CSSProperties } from "react";
import type {
  SavedMarket,
  MarketInfo,
  Outcome,
  TimeRangeLabel,
  StockSnapshot,
} from "../_lib/types";
import {
  COLOR_GREEN,
  COLOR_RED,
  REFRESH_INTERVAL_MS,
  STOCK_REFRESH_INTERVAL_MS,
  BUILTIN_MARKETS,
  US_EQUITY_BUILTIN_IDS,
  getStartTs,
  getFidelity,
  getYahooParams,
  getMarketHoursForTs,
  getTradingSession,
} from "../_lib/constants";
import { chartHistory, fetchEvent, fetchBatchedPrice, fetchStockData } from "../_lib/api";
import { subscribeToVisiblePolling } from "../_lib/visiblePolling";
import { getVisiblePolymarketOutcomes } from "../_lib/outcomes";
import { getCurrentPolymarketPrice, hasFreshPolymarketPrice } from "../_lib/polymarket";
import { getOutcomeColors } from "../_lib/colors";
import { getHighConfidenceOutcome } from "../_lib/highConfidence";
import OddsChart from "./OddsChart";
import OddsDisplay from "./OddsDisplay";
import StockDisplay from "./StockDisplay";
import MarketDropdown from "./MarketDropdown";
import headingStyles from "./MarketHeading.module.css";
import MoverReporter from "./MoverReporter";
import { describeMover, isMoverEligibleMarket, type MarketMover, type MoverCache, type MoverRange } from "../_lib/movers";
import { getHistoricalPrices } from "../_lib/chartHover";
import { useHoldPreview } from "../_lib/useHoldPreview";
import previewStyles from "./HoldPreview.module.css";
import panelStyles from "./Panel.module.css";

function Panel({
  slotIndex,
  marketId,
  savedMarkets,
  timeRange,
  compact: requestedCompact,
  mobileLandscape: requestedLandscape = false,
  tvMode: requestedTVMode = false,
  holdToExpand = false,
  moverRange = null,
  mover,
  onMoverChange,
  onChangeMarket,
  onManageMarkets,
}: {
  slotIndex: number;
  marketId: string | null;
  savedMarkets: SavedMarket[];
  timeRange: TimeRangeLabel;
  compact: boolean;
  mobileLandscape?: boolean;
  tvMode?: boolean;
  holdToExpand?: boolean;
  moverRange?: MoverRange | null;
  mover?: MarketMover;
  onMoverChange?: (slot: number, mover: MarketMover | null) => void;
  onChangeMarket: (slotIndex: number, marketId: string | null) => void;
  onManageMarkets: () => void;
}) {
  const preview = useHoldPreview(holdToExpand && marketId !== null, `${marketId}:${timeRange}`);
  const compact = !preview.active && requestedCompact;
  const mobileLandscape = !preview.active && requestedLandscape;
  const tvMode = !preview.active && requestedTVMode;
  // -- Polymarket state --
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  // -- Stock state --
  const [stockSnapshot, setStockSnapshot] = useState<StockSnapshot | null>(null);

  // -- Shared state --
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredTime, setHoveredTime] = useState<{ marketId: string | null; range: TimeRangeLabel; timestamp: number } | null>(null);
  const handleHoverTimeChange = useCallback((timestamp: number | null) => {
    setHoveredTime(timestamp == null ? null : { marketId, range: timeRange, timestamp });
  }, [marketId, timeRange]);
  const hoverTimestamp = hoveredTime?.marketId === marketId && hoveredTime?.range === timeRange ? hoveredTime.timestamp : null;

  const outcomesRef = useRef<Outcome[]>([]);
  const moverCache = useRef<MoverCache>({ histories: {} });
  const requestGeneration = useRef(0);
  const loadedMarketId = useRef<string | null>(null);

  const isBuiltin = marketId?.startsWith("builtin:") ?? false;
  const savedMarket = savedMarkets.find((saved) => saved.id === marketId);
  const savedSlug = savedMarket?.slug;

  // ---- POLYMARKET refresh ----
  const refreshPolyData = useCallback(
    async (current: Outcome[], range: TimeRangeLabel, generation: number) => {
      const now = Math.floor(Date.now() / 1000);
      const startTs = getStartTs(range);
      const fidelity = getFidelity(range);
      const updated = await Promise.all(
        current.map(async (o) => {
          const [price, history] = await Promise.all([
            fetchBatchedPrice(o.tokenId),
            chartHistory.get(o.tokenId, range, startTs, now, fidelity),
          ]);

          const receivedAt = Math.floor(Date.now() / 1000);
          const nextHistory = price && receivedAt >= startTs
            ? chartHistory.sample(o.tokenId, range, history, { t: receivedAt, p: price.price })
            : history;
          return {
            ...o,
            currentPrice: getCurrentPolymarketPrice(price, nextHistory, o.currentPrice, receivedAt),
            normalizationSafe: price?.normalizationSafe === true,
            priceIsFresh: hasFreshPolymarketPrice(price, nextHistory, receivedAt),
            history: nextHistory,
          };
        })
      );
      if (generation !== requestGeneration.current) return;
      outcomesRef.current = updated;
      setOutcomes(updated);
    },
    []
  );

  // ---- STOCK refresh ----
  const refreshStockData = useCallback(
    async (
      ticker: string,
      label: string,
      range: TimeRangeLabel,
      generation: number,
      displayType?: "price" | "yield",
      includePrePost?: boolean
    ) => {
      const { range: yahooRange, interval: yahooInterval } = getYahooParams(range);
      const startTs =
        range === "1H" || range === "4H" || range === "Election Night" ? getStartTs(range) : undefined;
      const snap = await fetchStockData(ticker, yahooRange, yahooInterval, startTs, includePrePost, range === "Election Night");
      if (snap && generation === requestGeneration.current) {
        const withLabel: StockSnapshot = { ...snap, label, displayType };
        setStockSnapshot(withLabel);
      }
    },
    []
  );

  // Late requests may fill the shared cache, but cannot restore an old
  // market or time window after the user has switched away.
  useEffect(() => {
    const generation = ++requestGeneration.current;

    // Reset state
    setMarket(null);
    setOutcomes([]);
    outcomesRef.current = [];
    setStockSnapshot(null);
    if (loadedMarketId.current !== marketId) {
      moverCache.current = { histories: {} };
      loadedMarketId.current = marketId;
    }
    setError(null);
    setHoveredTime(null);

    async function init() {
      setLoading(!!marketId);
      try {
        if (isBuiltin) {
          const builtin = BUILTIN_MARKETS.find((option) => option.id === marketId);
          if (builtin) await refreshStockData(builtin.ticker, builtin.label, timeRange, generation,
            builtin.displayType, !US_EQUITY_BUILTIN_IDS.has(builtin.id));
        } else if (marketId && savedSlug) {
          const info = await fetchEvent(savedSlug);
          if (generation !== requestGeneration.current) return;
          if (!info) { setError("Could not load market"); return; }
          setMarket(info);
          await refreshPolyData(info.outcomes, timeRange, generation);
        }
      } catch {
        if (generation === requestGeneration.current) setError("Could not load market data");
      } finally {
        if (generation === requestGeneration.current) setLoading(false);
      }
    }
    void init();
    return () => { requestGeneration.current = generation + 1; };
  }, [marketId, savedSlug, timeRange, refreshPolyData, refreshStockData, isBuiltin]);

  // ---- Polling ----
  const hasData = isBuiltin ? !!stockSnapshot : outcomes.length > 0;
  useEffect(() => {
    if (loading || !hasData) return;
    const ms = isBuiltin ? STOCK_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS;

    return subscribeToVisiblePolling(async () => {
      const generation = requestGeneration.current;
      if (isBuiltin) {
        const builtin = BUILTIN_MARKETS.find((m) => m.id === marketId);
        if (builtin) await refreshStockData(builtin.ticker, builtin.label, timeRange, generation, builtin.displayType, !US_EQUITY_BUILTIN_IDS.has(builtin.id));
      } else {
        await refreshPolyData(outcomesRef.current, timeRange, generation);
      }
    }, ms);
  }, [loading, hasData, isBuiltin, marketId, timeRange, refreshPolyData, refreshStockData]);

  // Chart outcomes for polymarket
  const isBinary = market?.kind === "binary";
  const visibleMultiOutcomes = getVisiblePolymarketOutcomes(outcomes, preview.active || compact, {
    title: market?.title,
    label: savedMarket?.label,
    outcomeNames: market?.outcomeNames,
  });
  const displayOutcomes = isBinary ? outcomes : visibleMultiOutcomes;
  const chartOutcomes = isBinary
    ? outcomes.slice(0, 1)
    : visibleMultiOutcomes;
  const outcomeColors = getOutcomeColors(chartOutcomes, savedMarket?.outcome_colors, market?.outcomeNames ?? outcomes.map((outcome) => outcome.name));
  const hoveredPrices = hoverTimestamp == null ? null : getHistoricalPrices(outcomes, hoverTimestamp);
  const highConfidence = !isBuiltin && !loading && !error
    ? getHighConfidenceOutcome(market, outcomes, chartOutcomes, savedMarket?.outcome_colors)
    : null;

  // Stock outcome shaped for OddsChart (reuses chart component)
  const stockChartOutcomes: Outcome[] = stockSnapshot
    ? [
        {
          name: stockSnapshot.label,
          tokenId: stockSnapshot.ticker,
          currentPrice: stockSnapshot.currentPrice,
          history: stockSnapshot.history,
        },
      ]
    : [];
  const hoveredStockPrice = hoverTimestamp == null ? undefined : getHistoricalPrices(stockChartOutcomes, hoverTimestamp)[stockSnapshot?.ticker ?? ""] ?? null;

  const panelTitle = isBuiltin
    ? (BUILTIN_MARKETS.find((m) => m.id === marketId)?.label ?? "")
    : (savedMarket?.label || market?.title || "");

  return (
    <div
      ref={preview.elementRef}
      onPointerDownCapture={preview.onPointerDownCapture}
      onPointerMoveCapture={preview.onPointerMoveCapture}
      onLostPointerCapture={preview.onLostPointerCapture}
      onClickCapture={preview.onClickCapture}
      onContextMenu={preview.onContextMenu}
      data-market-panel
      data-hold-preview={preview.active ? "true" : undefined}
      className={`flex flex-col h-full min-w-0 min-h-0 border border-white/10 bg-white/[0.02] overflow-hidden ${tvMode ? "tv-market-panel" : preview.active ? "" : panelStyles.panel} ${highConfidence ? "market-high-confidence" : ""} ${tvMode && mover ? "tv-market-mover" : ""} ${holdToExpand ? previewStyles.holdable : ""} ${preview.active ? previewStyles.preview : ""}`}
      style={{ position: tvMode ? "relative" : undefined, "--market-accent": highConfidence?.color } as CSSProperties}
      data-high-confidence-outcome={highConfidence?.outcome.tokenId}
      data-mover-market={tvMode && mover ? marketId : undefined}
      title={tvMode && mover ? describeMover(mover) : undefined}
      aria-describedby={tvMode && mover ? `tv-mover-${slotIndex}` : undefined}
      role="group"
      aria-label={highConfidence
        ? `${panelTitle}: ${highConfidence.outcome.name} at ${(highConfidence.outcome.currentPrice * 100).toFixed(1)}%. High market confidence, not an official result.`
        : panelTitle || `Market ${slotIndex + 1}`}
    >
      {tvMode && mover && (
        <div
          aria-hidden="true"
          data-mover-ring
          style={{
            position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none",
            border: `clamp(3px, 0.18vw, 7px) solid ${mover.color}`,
            boxShadow: `inset 0 0 clamp(6px, 0.45vw, 16px) color-mix(in srgb, ${mover.color} 60%, transparent)`,
          }}
        />
      )}
      {tvMode && mover && <span id={`tv-mover-${slotIndex}`} className="sr-only">{describeMover(mover)}</span>}
      {requestedTVMode && moverRange && marketId && !loading && !error && onMoverChange && (isBuiltin || (market && isMoverEligibleMarket(market, outcomes))) && (
        <MoverReporter
          key={`${marketId}:${moverRange}`}
          slotIndex={slotIndex}
          marketId={marketId}
          range={moverRange}
          market={market}
          outcomes={outcomes}
          chartOutcomes={chartOutcomes}
          stockSnapshot={stockSnapshot}
          cache={moverCache}
          overrides={savedMarket?.outcome_colors}
          onChange={onMoverChange}
        />
      )}
      {/* The title is the market picker in every layout. */}
      {preview.active ? (
        <div className={previewStyles.heading}>
          <p>{panelTitle}</p>
          <span>Release to return</span>
        </div>
      ) : tvMode ? (
        <div className="tv-panel-heading">
          <span className="tv-slot-number">{String(slotIndex + 1).padStart(2, "0")}</span>
          <div className={headingStyles.picker} data-market-heading>
            <p className={`${headingStyles.title} tv-panel-title`} aria-hidden="true">{panelTitle || "Select a market..."}</p>
            <MarketDropdown
              className={headingStyles.overlay}
              title={panelTitle || "Select a market"}
              savedMarkets={savedMarkets}
              selectedId={marketId}
              onSelect={(id) => onChangeMarket(slotIndex, id)}
            />
            <span className={headingStyles.chevron} aria-hidden="true" />
          </div>
        </div>
      ) : (
        <div className={`${panelStyles.heading} ${mobileLandscape ? panelStyles.landscapeHeading : ""}`}>
          <div className={headingStyles.picker} data-market-heading>
            <p className={headingStyles.title} aria-hidden="true">{panelTitle || "Select a market..."}</p>
            <MarketDropdown
              className={headingStyles.overlay}
              title={panelTitle || "Select a market"}
              savedMarkets={savedMarkets}
              selectedId={marketId}
              onSelect={(id) => onChangeMarket(slotIndex, id)}
            />
            <span className={headingStyles.chevron} aria-hidden="true" />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col px-2 pb-2">
        {!marketId && (
          <div className="flex-1 flex flex-col items-center justify-center text-white/30 text-sm gap-2">
            <p>{tvMode ? "Select a market above" : "No market selected"}</p>
            {savedMarkets.length === 0 && (
              <button
                onClick={onManageMarkets}
                className="text-xs text-white/50 hover:text-white/80 underline transition"
              >
                Add a market
              </button>
            )}
          </div>
        )}

        {marketId && loading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-white/40 text-sm">Loading...</p>
          </div>
        )}

        {marketId && error && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}

        {/* Stock panel */}
        {isBuiltin && !loading && !error && stockSnapshot && (() => {
          // On 1D: pin X-axis to the market's trading session hours
          // Use the last data point's date so weekends show the last trading day
          const session = getTradingSession(marketId ?? "");
          const lastTs =
            stockSnapshot.history.length > 0
              ? stockSnapshot.history[stockSnapshot.history.length - 1].t
              : null;
          const mktHours =
            session && timeRange === "1D" && lastTs != null
              ? getMarketHoursForTs(lastTs, session)
              : null;
          const nowSec = Math.floor(Date.now() / 1000);
          const chartXMin = mktHours?.openTs;
          const chartXMax = mktHours
            ? Math.min(nowSec, mktHours.closeTs)
            : undefined;

          // Chart line: previous close for intraday, period start for longer ranges
          const isIntraday = timeRange === "1H" || timeRange === "4H" || timeRange === "1D";
          const chartReference = isIntraday
            ? stockSnapshot.previousClose
            : stockSnapshot.history.length > 0
              ? stockSnapshot.history[0].p
              : stockSnapshot.previousClose;

          // % change: 1D uses previous close; other ranges use first data point of the period
          const periodStart = timeRange === "1D"
            ? stockSnapshot.previousClose
            : stockSnapshot.history.length > 0
              ? stockSnapshot.history[0].p
              : stockSnapshot.previousClose;

          const isDown =
            periodStart != null &&
            stockSnapshot.currentPrice < periodStart;
          const stockColor = isDown ? COLOR_RED : COLOR_GREEN;

          // Override previousClose with period start so StockDisplay shows period change
          const displaySnapshot = { ...stockSnapshot, previousClose: periodStart };

          return (
            <>
              <StockDisplay snapshot={displaySnapshot} compact={compact} mobileLandscape={mobileLandscape} tvMode={tvMode} showTitle={false} hoveredPrice={hoveredStockPrice} />
              <div className="mt-1 flex-1 min-h-0">
                <OddsChart
                  key={`${marketId}:${timeRange}`}
                  outcomes={stockChartOutcomes}
                  colors={[stockColor]}
                  startTs={getStartTs(timeRange)}
                  valueFormat={stockSnapshot.displayType === "yield" ? "yield" : "price"}
                  xMin={chartXMin}
                  xMax={chartXMax}
                  previousClose={chartReference}
                  mobileLandscape={mobileLandscape}
                  tvMode={tvMode}
                  onHoverTimeChange={handleHoverTimeChange}
                />
              </div>
            </>
          );
        })()}

        {/* Polymarket panel */}
        {!isBuiltin && !loading && !error && market && outcomes.length > 0 && (
          <>
            <OddsDisplay
              market={{ ...market, title: savedMarket?.label || market.title }}
              outcomes={outcomes}
              visibleOutcomes={displayOutcomes}
              colors={outcomeColors}
              compact={compact}
              mobileLandscape={mobileLandscape}
              tvMode={tvMode}
              showTitle={false}
              hoveredPrices={hoveredPrices}
            />
            <div className="mt-1 flex-1 min-h-0">
              <OddsChart
                key={`${marketId}:${timeRange}`}
                outcomes={chartOutcomes}
                colors={outcomeColors}
                startTs={getStartTs(timeRange)}
                valueFormat="percent"
                showLegend={!compact && !preview.active}
                mobileLandscape={mobileLandscape}
                tvMode={tvMode}
                onHoverTimeChange={handleHoverTimeChange}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default memo(Panel);
