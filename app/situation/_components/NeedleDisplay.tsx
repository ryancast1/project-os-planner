"use client";

import type { CSSProperties } from "react";
import { needleRotation, type NeedleModel } from "../_lib/needle";
import styles from "./NeedleDisplay.module.css";
import type { NeedleDistribution } from "../_lib/needleDistribution";
import NeedleDistributionDisplay from "./NeedleDistributionDisplay";

const CX = 180;
const CY = 173;
function point(radius: number, angle: number) {
  const radians = angle * Math.PI / 180;
  return [CX + radius * Math.cos(radians), CY - radius * Math.sin(radians)];
}
function segment(from: number, to: number) {
  return `M ${point(163, from).join(" ")} A 163 163 0 0 1 ${point(163, to).join(" ")} L ${point(65, to).join(" ")} A 65 65 0 0 0 ${point(65, from).join(" ")} Z`;
}
const LABELS = ["VERY LIKELY", "LIKELY", "LEANING", "TOSSUP", "LEANING", "LIKELY", "VERY LIKELY"];
const ink = (color: string) => `color-mix(in srgb, ${color} 65%, black)`;

export default function NeedleDisplay({ model, distribution, fallbackLabel = "No current odds", fallbackValue = "Waiting for a reliable market price", fallbackContext = "No current probability available" }: {
  model: NeedleModel | null;
  distribution?: NeedleDistribution | null;
  fallbackLabel?: string;
  fallbackValue?: string;
  fallbackContext?: string;
}) {
  if (distribution) return <NeedleDistributionDisplay distribution={distribution} />;
  const description = model
    ? `${model.context}. ${model.left.name}: ${(model.left.probability * 100).toFixed(1)} percent. ${model.right.name}: ${(model.right.probability * 100).toFixed(1)} percent. ${model.headline}. Based on Polymarket prices, not an election forecast or a called result.`
    : `${fallbackLabel}. ${fallbackValue}. No probability is inferred.`;
  return (
    <div className={styles.needle} data-needle data-needle-kind={model?.kind ?? "unavailable"} role="img" aria-label={description} title={description}>
      <svg viewBox="0 0 360 184" className={styles.dial} aria-hidden="true" preserveAspectRatio="xMidYMax meet">
        {LABELS.map((label, index) => {
          const from = 180 - index * 180 / 7;
          const to = 180 - (index + 1) * 180 / 7;
          const color = index < 3 ? model?.left.color : model?.right.color;
          const weight = [18, 12, 6, 0, 6, 12, 18][index];
          const [x, y] = point(123, (from + to) / 2);
          return (
            <g key={index}>
              <path d={segment(from, to)} fill={!model || index === 3 ? "#fafaf9" : `color-mix(in srgb, ${color} ${weight}%, white)`} stroke="#e8e9e9" strokeWidth="1" />
              {model && <text x={x} y={y + 3} textAnchor="middle" className={styles.bandLabel}>{label}</text>}
            </g>
          );
        })}
        <path d="M 15 173 H 345" stroke="#929794" strokeWidth="1.4" />
        <g className={styles.hand} style={{ transform: `rotate(${model ? needleRotation(model.leftProbability) : 0}deg)`, opacity: model ? 1 : 0.25 } as CSSProperties}>
          <path d="M 172.5 174 L 180 10 L 187.5 174 Z" fill="#8e918d" stroke="white" strokeWidth="2" strokeLinejoin="round" />
        </g>
        <circle cx={CX} cy={CY} r="10" fill={model ? "#8e918d" : "#d7dad8"} stroke="white" strokeWidth="2" />
      </svg>
      <div className={styles.sides} aria-hidden="true">
        <span title={model?.left.name} style={{ color: model ? ink(model.left.color) : undefined }}>{model?.left.label ?? ""}</span>
        <span title={model?.right.name} style={{ color: model ? ink(model.right.color) : undefined }}>{model?.right.label ?? ""}</span>
      </div>
      <div className={styles.readout} style={{ color: model ? ink(model.color) : "#666c70" }}>
        <p className={styles.headline} data-needle-headline>{model?.headline ?? fallbackLabel}</p>
        <p className={styles.detail} data-needle-value>{model?.detail ?? fallbackValue}</p>
        <p className={styles.context}>{model?.context ?? fallbackContext}</p>
      </div>
    </div>
  );
}
