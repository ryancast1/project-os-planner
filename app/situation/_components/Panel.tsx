"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type {
  SavedMarket,
  MarketInfo,
  Outcome,
  TimeRangeLabel,
  StockSnapshot,
} from "../_lib/types";
import {
  COLORS,
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
} from "../_lib/constants";
import { fetchEvent, fetchPrice, fetchPriceHistory, fetchStockData } from "../_lib/api";
import OddsChart from "./OddsChart";
import OddsDisplay from "./OddsDisplay";
import StockDisplay from "./StockDisplay";
import MarketDropdown from "./MarketDropdown";

export default function Panel({
  slotIndex,
  marketId,
  savedMarkets,
  timeRange,
  compact,
  mobileLandscape = false,
  onChangeMarket,
  onManageMarkets,
}: {
  slotIndex: number;
  marketId: string | null;
  savedMarkets: SavedMarket[];
  timeRange: TimeRangeLabel;
  compact: boolean;
  mobileLandscape?: boolean;
  onChangeMarket: (slotIndex: number, marketId: string | null) => void;
  onManageMarkets: () => void;
}) {
  // -- Polymarket state --
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  // -- Stock state --
  const [stockSnapshot, setStockSnapshot] = useState<StockSnapshot | null>(null);

  // -- Shared state --
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcomesRef = useRef<Outcome[]>([]);
  const stockRef = useRef<StockSnapshot | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeRangeRef = useRef<TimeRangeLabel>(timeRange);

  const isBuiltin = marketId?.startsWith("builtin:") ?? false;

  // Keep timeRangeRef in sync
  useEffect(() => {
    timeRangeRef.current = timeRange;
  }, [timeRange]);

  // ---- POLYMARKET refresh ----
  const refreshPolyData = useCallback(
    async (current: Outcome[], range: TimeRangeLabel) => {
      const now = Math.floor(Date.now() / 1000);
      const startTs = getStartTs(range);
      const fidelity = getFidelity(range);
      const updated = await Promise.all(
        current.map(async (o) => {
          const [price, history] = await Promise.all([
            fetchPrice(o.tokenId),
            fetchPriceHistory(o.tokenId, startTs, now, fidelity),
          ]);
          return {
            ...o,
            currentPrice: price ?? o.currentPrice,
            history: history.length > 0 ? history : o.history,
          };
        })
      );
      outcomesRef.current = updated;
      setOutcomes(updated);
    },
    []
  );

  // ---- STOCK refresh ----
  const refreshStockData = useCallback(
    async (ticker: string, label: string, range: TimeRangeLabel) => {
      const { range: yahooRange, interval: yahooInterval } = getYahooParams(range);
      const startTs =
        range === "1H" || range === "4H" ? getStartTs(range) : undefined;
      const snap = await fetchStockData(ticker, yahooRange, yahooInterval, startTs);
      if (snap) {
        const withLabel: StockSnapshot = { ...snap, label };
        stockRef.current = withLabel;
        setStockSnapshot(withLabel);
      }
    },
    []
  );

  // ---- Load market when marketId changes ----
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Reset state
    setMarket(null);
    setOutcomes([]);
    outcomesRef.current = [];
    setStockSnapshot(null);
    stockRef.current = null;
    setError(null);

    if (!marketId) {
      setLoading(false);
      return;
    }

    // ---- Built-in stock ----
    if (isBuiltin) {
      const builtin = BUILTIN_MARKETS.find((m) => m.id === marketId);
      if (!builtin) { setLoading(false); return; }

      let cancelled = false;
      setLoading(true);

      refreshStockData(builtin.ticker, builtin.label, timeRangeRef.current).then(() => {
        if (!cancelled) setLoading(false);
      });

      return () => { cancelled = true; };
    }

    // ---- Polymarket ----
    const saved = savedMarkets.find((m) => m.id === marketId);
    if (!saved) { setLoading(false); return; }

    let cancelled = false;

    async function init() {
      setLoading(true);
      const info = await fetchEvent(saved!.slug);
      if (cancelled) return;
      if (!info) {
        setError("Could not load market");
        setLoading(false);
        return;
      }
      setMarket(info);
      await refreshPolyData(info.outcomes, timeRangeRef.current);
      if (!cancelled) setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, [marketId, savedMarkets, refreshPolyData, refreshStockData, isBuiltin]);

  // ---- Re-fetch when time range changes ----
  useEffect(() => {
    if (isBuiltin) {
      if (!stockRef.current) return;
      const builtin = BUILTIN_MARKETS.find((m) => m.id === marketId);
      if (builtin) refreshStockData(builtin.ticker, builtin.label, timeRange);
    } else {
      if (outcomesRef.current.length === 0) return;
      refreshPolyData(outcomesRef.current, timeRange);
    }
  }, [timeRange, isBuiltin, marketId, refreshPolyData, refreshStockData]);

  // ---- Polling ----
  useEffect(() => {
    const hasData = isBuiltin ? !!stockSnapshot : outcomes.length > 0;
    if (!hasData) return;

    const ms = isBuiltin ? STOCK_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS;

    intervalRef.current = setInterval(() => {
      if (isBuiltin) {
        const builtin = BUILTIN_MARKETS.find((m) => m.id === marketId);
        if (builtin) refreshStockData(builtin.ticker, builtin.label, timeRangeRef.current);
      } else {
        refreshPolyData(outcomesRef.current, timeRangeRef.current);
      }
    }, ms);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isBuiltin ? !!stockSnapshot : outcomes.length > 0, isBuiltin, marketId, refreshPolyData, refreshStockData]);

  // Chart outcomes for polymarket
  const isBinary = market && outcomes.length === 2 && outcomes[0].name === "Yes";
  const chartOutcomes = isBinary
    ? [outcomes[0]]
    : outcomes.slice(0, compact ? 2 : 4);

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

  // Title shown in landscape mobile instead of the interactive dropdown
  const panelTitle = isBuiltin
    ? (BUILTIN_MARKETS.find((m) => m.id === marketId)?.label ?? "")
    : (savedMarkets.find((m) => m.id === marketId)?.label ?? "");

  return (
    <div className="flex flex-col h-full rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Landscape mobile: read-only title | Normal: interactive dropdown */}
      {mobileLandscape ? (
        <div className="shrink-0 px-2 pt-1.5 pb-0">
          <p className="text-[10px] text-white/40 truncate">{panelTitle}</p>
        </div>
      ) : (
        <div className="shrink-0 p-2">
          <MarketDropdown
            savedMarkets={savedMarkets}
            selectedId={marketId}
            onSelect={(id) => onChangeMarket(slotIndex, id)}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col px-2 pb-2">
        {!marketId && (
          <div className="flex-1 flex flex-col items-center justify-center text-white/30 text-sm gap-2">
            <p>No market selected</p>
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
          // For US equity indices on 1D: pin X-axis to 9:30 AM – 4:00 PM ET
          // Use the last data point's date so weekends show the last trading day
          const isUSEquity = US_EQUITY_BUILTIN_IDS.has(marketId ?? "");
          const lastTs =
            stockSnapshot.history.length > 0
              ? stockSnapshot.history[stockSnapshot.history.length - 1].t
              : null;
          const mktHours =
            isUSEquity && timeRange === "1D" && lastTs != null
              ? getMarketHoursForTs(lastTs)
              : null;
          const nowSec = Math.floor(Date.now() / 1000);
          const chartXMin = mktHours?.openTs;
          const chartXMax = mktHours
            ? Math.min(nowSec, mktHours.closeTs)
            : undefined;

          const isDown =
            stockSnapshot.previousClose != null &&
            stockSnapshot.currentPrice < stockSnapshot.previousClose;
          const stockColor = isDown ? COLOR_RED : COLOR_GREEN;

          return (
            <>
              <StockDisplay snapshot={stockSnapshot} compact={compact} />
              <div className="mt-1 flex-1 min-h-0">
                <OddsChart
                  outcomes={stockChartOutcomes}
                  colors={[stockColor]}
                  startTs={getStartTs(timeRange)}
                  valueFormat="price"
                  xMin={chartXMin}
                  xMax={chartXMax}
                />
              </div>
            </>
          );
        })()}

        {/* Polymarket panel */}
        {!isBuiltin && !loading && !error && market && outcomes.length > 0 && (
          <>
            <OddsDisplay market={market} outcomes={outcomes} compact={compact} />
            <div className="mt-1 flex-1 min-h-0">
              <OddsChart
                outcomes={chartOutcomes}
                colors={COLORS}
                startTs={getStartTs(timeRange)}
                valueFormat="percent"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
