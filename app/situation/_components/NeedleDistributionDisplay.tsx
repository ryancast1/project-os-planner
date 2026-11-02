"use client";

import { formatNeedleSlice, type NeedleDistribution } from "../_lib/needleDistribution";
import styles from "./NeedleDisplay.module.css";

function point(radius: number, angle: number) {
  const radians = angle * Math.PI / 180;
  return [180 + radius * Math.cos(radians), 173 - radius * Math.sin(radians)];
}
function wedge(from: number, to: number) {
  return `M ${point(163, from).join(" ")} A 163 163 0 ${from - to > 180 ? 1 : 0} 1 ${point(163, to).join(" ")} L ${point(65, to).join(" ")} A 65 65 0 ${from - to > 180 ? 1 : 0} 0 ${point(65, from).join(" ")} Z`;
}

export default function NeedleDistributionDisplay({ distribution }: { distribution: NeedleDistribution }) {
  const segments = distribution.slices.map((slice, index) => {
    const from = 180 - distribution.slices.slice(0, index).reduce((sum, previous) => sum + previous.share, 0) * 180;
    const to = index === distribution.slices.length - 1 ? 0 : Math.max(0, from - slice.share * 180);
    const [x, y] = point(119, (from + to) / 2);
    return { slice, from, to, x, y };
  });
  const description = `${distribution.context}. ${distribution.slices.map((slice) => `${slice.name}: ${formatNeedleSlice(slice)} ${slice.grouped ? "grouped share" : "market price"}${slice.grouped && slice.members.length ? `, grouping ${slice.members.join(", ")}` : ""}`).join(". ")}. ${distribution.relative ? "Arc sizes show relative price weights; these outcomes do not form a verified 100-percent distribution." : "Arc sizes show each category's share of the full market, not just the top two outcomes."}`;
  return (
    <div className={`${styles.needle} ${styles.distribution}`} data-needle data-needle-kind="distribution" role="img" aria-label={description} title={description}>
      <svg viewBox="0 0 360 184" className={styles.dial} aria-hidden="true" preserveAspectRatio="xMidYMax meet">
        {segments.map(({ slice, from, to, x, y }) => (
          <g key={slice.key} data-needle-slice={slice.key}>
            <title>{`${slice.name}: ${formatNeedleSlice(slice)}${slice.members.length > 1 ? ` (${slice.members.join(", ")})` : ""}`}</title>
            <path d={wedge(from, to)} fill={`color-mix(in srgb, ${slice.color} 32%, white)`} stroke="white" strokeWidth="1.5" />
            {slice.share >= 0.09 && <text x={x} y={y + 4} textAnchor="middle" className={styles.sliceValue} fill={`color-mix(in srgb, ${slice.color} 55%, black)`}>{formatNeedleSlice(slice)}</text>}
          </g>
        ))}
        <path d="M 15 173 H 345" stroke="#a4aaac" strokeWidth="1" />
        <text x="180" y="153" textAnchor="middle" className={styles.multiLabel}>OUTCOMES</text>
      </svg>
      <p className={styles.distributionHeading} data-needle-headline>Outcome breakdown</p>
      <div className={styles.distributionLegend} data-needle-value>
        {distribution.slices.map((slice) => (
          <div key={slice.key} className={styles.legendItem} title={`${slice.name}: ${formatNeedleSlice(slice)}${slice.members.length > 1 ? ` (${slice.members.join(", ")})` : ""}`} style={{ color: `color-mix(in srgb, ${slice.color} 65%, black)` }}>
            <span className={styles.legendName}>{slice.label}</span>
            <span className={styles.legendValue}>{formatNeedleSlice(slice)}</span>
          </div>
        ))}
      </div>
      <p className={styles.context}>{distribution.context}</p>
    </div>
  );
}
