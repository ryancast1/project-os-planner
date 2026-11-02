"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";
import { fetchPriceHistory, fetchStockData } from "../_lib/api";
import { BUILTIN_MARKETS, US_EQUITY_BUILTIN_IDS } from "../_lib/constants";
import { combineMoverHistories, getMissingMoverTokens, getMoverBaseline, getMoverWindow, getPolymarketMover, getStockMover, hasStockMoverCoverage, mergeMoverHistory, MOVER_REFRESH_MS, type MarketMover, type MoverCache, type MoverRange } from "../_lib/movers";
import type { MarketInfo, Outcome, OutcomeColors, StockSnapshot } from "../_lib/types";
import { subscribeToVisiblePolling } from "../_lib/visiblePolling";

export default function MoverReporter({ slotIndex, marketId, range, market, outcomes, chartOutcomes, stockSnapshot, cache, overrides, onChange }: {
  slotIndex: number;
  marketId: string;
  range: MoverRange;
  market: MarketInfo | null;
  outcomes: Outcome[];
  chartOutcomes: Outcome[];
  stockSnapshot: StockSnapshot | null;
  cache: RefObject<MoverCache>;
  overrides?: OutcomeColors;
  onChange: (slot: number, mover: MarketMover | null) => void;
}) {
  const tokens = outcomes.map((outcome) => outcome.tokenId).sort().join(",");
  const builtin = BUILTIN_MARKETS.find((option) => option.id === marketId);

  const getStockSnapshot = useEffectEvent(() => {
    const snapshot = stockSnapshot ?? cache.current.stock;
    return snapshot ? { ...snapshot, history: mergeMoverHistory(cache.current.stock?.history ?? [], stockSnapshot?.history ?? []) } : null;
  });
  const publish = useEffectEvent(() => {
    const now = Math.floor(Date.now() / 1000);
    if (builtin) {
      const snapshot = getStockSnapshot();
      onChange(slotIndex, snapshot ? getStockMover(marketId, range, snapshot, now) : null);
    } else if (market) {
      const histories = combineMoverHistories(outcomes, cache.current.histories);
      const { target, tolerance } = getMoverWindow(range, now);
      for (const outcome of outcomes) {
        const baseline = getMoverBaseline(histories[outcome.tokenId], target, tolerance);
        if (baseline) cache.current.histories[outcome.tokenId] = mergeMoverHistory(cache.current.histories[outcome.tokenId] ?? [], [baseline]);
      }
      onChange(slotIndex, getPolymarketMover(marketId, range, market, outcomes, chartOutcomes,
        histories, now, overrides));
    }
  });

  const missingTokens = useEffectEvent((now: number) => getMissingMoverTokens(outcomes,
    combineMoverHistories(outcomes, cache.current.histories), range, now));

  // Live chart quotes update the ranking without downloading history again.
  useEffect(() => { publish(); }, [outcomes, overrides, market, stockSnapshot]);

  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const marketCache = cache.current;

    async function refresh() {
      if (pending || document.hidden || cancelled) return;
      pending = true;
      try {
        const now = Math.floor(Date.now() / 1000);
        publish();
        if (builtin) {
          const existing = getStockSnapshot();
          if (existing && hasStockMoverCoverage(range, existing, now)) return;
          const snapshot = await fetchStockData(builtin.ticker, "5d", range === "1D" ? "5m" : "1m",
            undefined, !US_EQUITY_BUILTIN_IDS.has(builtin.id));
          if (!cancelled && snapshot) {
            cache.current.stock = { ...snapshot, label: builtin.label };
            publish();
          }
        } else if (tokens) {
          const { start, target } = getMoverWindow(range, now);
          await Promise.all(missingTokens(now).map(async (token) => {
            const fidelity = range === "1D" ? 5 : 1;
            const requests = marketCache.pendingHistories ??= new Map();
            const key = `${token}:${start}:${target}:${fidelity}`;
            // Share requests across quick toggles and Strict Mode effect replays.
            const request = requests.get(key) ?? fetchPriceHistory(token, start, target, fidelity);
            requests.set(key, request);
            const history = await request;
            if (requests.get(key) === request) requests.delete(key);
            if (marketCache !== cache.current) return;
            marketCache.histories[token] = mergeMoverHistory(marketCache.histories[token] ?? [], history);
            if (!cancelled) publish();
          }));
        }
      } finally {
        pending = false;
      }
    }

    void refresh();
    const stop = subscribeToVisiblePolling(refresh, MOVER_REFRESH_MS);
    return () => {
      cancelled = true;
      stop();
      onChange(slotIndex, null);
    };
  }, [marketId, range, tokens, builtin, slotIndex, onChange, cache]);

  return null;
}
