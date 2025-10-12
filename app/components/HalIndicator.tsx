"use client";

import { useMemo, type CSSProperties } from "react";
import styles from "./controls.module.css";

export type HalIndicatorProps = {
  level: number;
  active: boolean;
  hasMetrics: boolean;
};

export type HalGlowResult = {
  intensity: number;
  state: "waiting" | "idle" | "active";
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function calculateHalGlow(
  level: number,
  hasMetrics: boolean,
  active: boolean,
): HalGlowResult {
  if (!hasMetrics) {
    return { intensity: 0.2, state: "waiting" };
  }

  const clampedLevel = clamp(level);
  const idleIntensity = clamp(clampedLevel * 0.55 + 0.25, 0.25, 0.65);
  const activeIntensity = clamp(clampedLevel * 0.65 + 0.45, 0.5, 1);
  const intensity = active ? activeIntensity : idleIntensity;

  return {
    intensity: Number(intensity.toFixed(3)),
    state: active ? "active" : "idle",
  };
}

export function HalIndicator({ level, active, hasMetrics }: HalIndicatorProps) {
  const { intensity, state } = useMemo(
    () => calculateHalGlow(level, hasMetrics, active),
    [level, hasMetrics, active],
  );

  const label = active
    ? "AI is speaking"
    : hasMetrics
      ? "AI is idle"
      : "Waiting for audio";

  return (
    <div
      className={styles.halIndicator}
      data-state={state}
      data-ready={hasMetrics ? "true" : "false"}
      style={{ "--hal-intensity": intensity.toString() } as CSSProperties}
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="voice-activity-indicator"
    >
      <div className={styles.halLens} aria-hidden="true">
        <span className={styles.halRing} />
        <span className={styles.halCore} />
        <span className={styles.halGlint} />
      </div>
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}
