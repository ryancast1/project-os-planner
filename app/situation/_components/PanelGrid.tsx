"use client";

import type { LayoutMode, SavedMarket, TimeRangeLabel, PanelSlot } from "../_lib/types";
import { LAYOUT_CONFIGS } from "../_lib/constants";
import Panel from "./Panel";

export default function PanelGrid({
  layout,
  panels,
  savedMarkets,
  timeRange,
  onChangeMarket,
  onManageMarkets,
  mobilePortrait = false,
}: {
  layout: LayoutMode;
  panels: PanelSlot[];
  savedMarkets: SavedMarket[];
  timeRange: TimeRangeLabel;
  onChangeMarket: (slotIndex: number, marketId: string | null) => void;
  onManageMarkets: () => void;
  mobilePortrait?: boolean;
}) {
  const config = LAYOUT_CONFIGS[layout];
  const compact = config.panelCount >= 4;

  // Portrait mobile: single-column scroll list, one panel per ~screen
  if (mobilePortrait) {
    return (
      <div className="flex flex-col gap-3 pb-4">
        {Array.from({ length: config.panelCount }, (_, i) => (
          <div key={i} className="h-[88dvh] shrink-0">
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
