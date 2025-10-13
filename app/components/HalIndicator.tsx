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
    return { intensity: 0.08, state: "waiting" };
  }

  const clampedLevel = clamp(level);
  const idleIntensity = clamp(clampedLevel * 0.4 + 0.15, 0.15, 0.45);
  const activeIntensity = clamp(clampedLevel * 0.8 + 0.3, 0.3, 1);
  const intensity = active ? activeIntensity : idleIntensity;

  return {
    intensity: Number(intensity.toFixed(3)),
    state: active ? "active" : "idle",
  };
}

export function HalIndicator({ level, active, hasMetrics }: HalIndicatorProps) {
  // Scale level so 0.15 = 1.0 for calculation
  const scaledLevel = Math.min(level / 0.15, 1.0);

  const { intensity, state } = useMemo(
    () => calculateHalGlow(scaledLevel, hasMetrics, active),
    [scaledLevel, hasMetrics, active],
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
