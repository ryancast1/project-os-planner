export function createTradingTimeScale(values: readonly number[]) {
  const timestamps = [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);
  const last = timestamps.length - 1;
  return {
    timestamps,
    // Each actual candle gets equal horizontal space. No holiday calendar or
    // guessed prices are needed, and overnight price changes remain intact.
    toPosition(timestamp: number): number {
      if (last <= 0 || !Number.isFinite(timestamp)) return 0.5;
      if (timestamp <= timestamps[0]) return 0;
      if (timestamp >= timestamps[last]) return 1;
      let lo = 1;
      let hi = last;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (timestamps[mid] < timestamp) lo = mid + 1;
        else hi = mid;
      }
      const fraction = (timestamp - timestamps[lo - 1]) / (timestamps[lo] - timestamps[lo - 1]);
      return (lo - 1 + fraction) / last;
    },
    timestampAtPosition(position: number): number | null {
      if (last < 0 || !Number.isFinite(position)) return null;
      const index = Math.round(Math.max(0, Math.min(1, position)) * last);
      return timestamps[index];
    },
  };
}
