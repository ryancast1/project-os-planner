"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { LayoutMode, SavedMarket, TimeRangeLabel, PanelSlot } from "../_lib/types";
import { LAYOUT_CONFIGS } from "../_lib/constants";
import Panel from "./Panel";
import { getTopMovers, MOVER_REFRESH_MS, type MarketMover, type MoverRange } from "../_lib/movers";

export default function PanelGrid({
  layout,
  panels,
  savedMarkets,
  timeRange,
  onChangeMarket,
  onManageMarkets,
  mobilePortrait = false,
  mobileLandscape = false,
  moverRange = null,
  onMoverCountChange,
}: {
  layout: LayoutMode;
  panels: PanelSlot[];
  savedMarkets: SavedMarket[];
  timeRange: TimeRangeLabel;
  onChangeMarket: (slotIndex: number, marketId: string | null) => void;
  onManageMarkets: () => void;
  mobilePortrait?: boolean;
  mobileLandscape?: boolean;
  moverRange?: MoverRange | null;
  onMoverCountChange?: (count: number) => void;
}) {
  const config = LAYOUT_CONFIGS[layout];
  const compact = config.panelCount >= 4;
  const [moverCandidates, setMoverCandidates] = useState<Record<number, MarketMover | null>>({});
  const [moverNow, setMoverNow] = useState(0);
  const handleMoverChange = useCallback((slot: number, mover: MarketMover | null) => {
    setMoverCandidates((current) => ({ ...current, [slot]: mover }));
    setMoverNow(Math.floor(Date.now() / 1000));
  }, []);
  useEffect(() => {
    if (layout !== "7x4" || !moverRange) return;
    const timer = window.setInterval(() => setMoverNow(Math.floor(Date.now() / 1000)), MOVER_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [layout, moverRange]);
  const topMovers = getTopMovers(Object.entries(moverCandidates)
    .filter(([slot, candidate]) => panels[Number(slot)] === candidate?.marketId)
    .map(([, candidate]) => candidate), moverRange, panels, moverNow);
  const moverCount = topMovers.length;
  useEffect(() => { onMoverCountChange?.(moverCount); }, [moverCount, onMoverCountChange]);

  // -- Portrait mobile carousel state --
  const [activeCard, setActiveCard] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    const idx = Math.round(scrollLeft / clientWidth);
    setActiveCard(idx);
  }, []);

  const scrollToCard = useCallback((i: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      left: i * scrollRef.current.clientWidth,
      behavior: "smooth",
    });
  }, []);

  if (layout === "7x4" && !mobilePortrait) {
    return (
      <div className="tv-grid" aria-label="Market grid: 7 columns, 4 rows">
        {Array.from({ length: config.panelCount }, (_, i) => (
          <Panel
            key={`${i}:${panels[i] ?? "empty"}`}
            slotIndex={i}
            marketId={panels[i] ?? null}
            savedMarkets={savedMarkets}
            timeRange={timeRange}
            compact
            tvMode
            moverRange={moverRange}
            mover={topMovers.find((mover) => mover.marketId === panels[i])}
            onMoverChange={handleMoverChange}
            onChangeMarket={onChangeMarket}
            onManageMarkets={onManageMarkets}
          />
        ))}
      </div>
    );
  }

  // Landscape mobile: force correct col/row counts without md: dependency, hide dropdowns
  if (mobileLandscape) {
    const landscapeGridClass = `grid-cols-${config.cols} grid-rows-${config.rows}`;
    return (
      <div className={`grid ${landscapeGridClass} gap-1.5 flex-1 min-h-0`}>
        {Array.from({ length: config.panelCount }, (_, i) => (
          <Panel
            key={i}
            slotIndex={i}
            marketId={panels[i] ?? null}
            savedMarkets={savedMarkets}
            timeRange={timeRange}
            compact={true}
            mobileLandscape={true}
            onChangeMarket={onChangeMarket}
            onManageMarkets={onManageMarkets}
          />
        ))}
      </div>
    );
  }

  // Portrait mobile: horizontal swipe carousel with snap + dot indicators
  if (mobilePortrait) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Horizontal scroll container */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory"
          style={{ scrollbarWidth: "none" }}
        >
          {Array.from({ length: config.panelCount }, (_, i) => (
            <div key={i} className="w-full h-full shrink-0 snap-start">
              <Panel
                slotIndex={i}
                marketId={panels[i] ?? null}
                savedMarkets={savedMarkets}
                timeRange={timeRange}
                compact={false}
                onChangeMarket={onChangeMarket}
                onManageMarkets={onManageMarkets}
              />
            </div>
          ))}
        </div>

        {/* Dot indicators (only when multiple cards) */}
        {config.panelCount > 1 && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 shrink-0">
            {Array.from({ length: config.panelCount }, (_, i) => (
              <button
                key={i}
                onClick={() => scrollToCard(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === activeCard ? "bg-white/70" : "bg-white/20"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Landscape / desktop: CSS grid
  return (
    <div className={`grid ${config.gridClass} gap-2 flex-1 min-h-0`}>
      {Array.from({ length: config.panelCount }, (_, i) => (
        <Panel
          key={i}
          slotIndex={i}
          marketId={panels[i] ?? null}
          savedMarkets={savedMarkets}
          timeRange={timeRange}
          compact={compact}
          onChangeMarket={onChangeMarket}
          onManageMarkets={onManageMarkets}
        />
      ))}
    </div>
  );
}
