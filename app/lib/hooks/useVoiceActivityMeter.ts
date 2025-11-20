import { useEffect, useRef, useState } from "react";
import type { RealtimeSession } from "@openai/agents/realtime";

import type { ConnectionStatus } from "@/app/components/SessionControls";

export type VoiceActivityState = {
  level: number;
  active: boolean;
  hasMetrics: boolean;
};

export const defaultVoiceActivityState: VoiceActivityState = {
  level: 0,
  active: false,
  hasMetrics: false,
};

type VoiceActivitySession = RealtimeSession & {
  getLatestAudioLevel?: () => number | null | undefined;
};

const clampLevel = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
};

type UseVoiceActivityMeterOptions = {
  session: RealtimeSession | null;
  status: ConnectionStatus;
  audioElement: HTMLAudioElement | null;
  pollIntervalMs?: number;
};

/**
 * Observes audio levels from the realtime session and derives a smoothed,
 * binary voice activity state for UI indicators. Falls back to the session's
 * `getLatestAudioLevel` when no audio analyser is available.
 */
export function useVoiceActivityMeter({
  session,
  status,
  audioElement,
  pollIntervalMs = 120,
}: UseVoiceActivityMeterOptions): VoiceActivityState {
  const [voiceActivity, setVoiceActivity] = useState<VoiceActivityState>(
    defaultVoiceActivityState,
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!session || status !== "connected") {
      analyserCleanupRef.current?.();
      analyserCleanupRef.current = null;
      setVoiceActivity(defaultVoiceActivityState);
      return;
    }

    if (typeof window === "undefined") {
      setVoiceActivity(defaultVoiceActivityState);
      return;
    }

    const voiceSession = session as VoiceActivitySession;
    const AudioContextCtor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    analyserCleanupRef.current?.();
    setVoiceActivity(defaultVoiceActivityState);

    let rafId: number | null = null;
    let pollTimeout: number | null = null;
    let fallbackInterval: number | null = null;
    let noLevelCount = 0;
    let cancelled = false;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    const cleanupAnalyser = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (pollTimeout !== null) {
        window.clearTimeout(pollTimeout);
        pollTimeout = null;
      }
      if (source) {
        source.disconnect();
        source = null;
      }
      if (analyser) {
        analyser.disconnect();
        analyser = null;
      }
    };

    analyserCleanupRef.current = cleanupAnalyser;

    const updateFromLevel = (rawLevel: number) => {
      setVoiceActivity((previous) => {
        const level = clampLevel(rawLevel);
        const smoothed = previous.hasMetrics
          ? previous.level * 0.5 + level * 0.5
          : level;
        const active = smoothed > 0.03;

        if (
          previous.hasMetrics &&
          Math.abs(previous.level - smoothed) < 0.002 &&
          previous.active === active
        ) {
          return previous;
        }

        return {
          level: smoothed,
          active,
          hasMetrics: true,
        };
      });
    };

    const startAnalyser = async () => {
      if (!AudioContextCtor || !audioElement) {
        return;
      }

      const stream = audioElement.srcObject as MediaStream | null;
      if (!stream || stream.getAudioTracks().length === 0) {
        if (!cancelled) {
          pollTimeout = window.setTimeout(startAnalyser, 200);
        }
        return;
      }

      let context = audioContextRef.current;
      if (!context) {
        context = new AudioContextCtor();
        audioContextRef.current = context;
      }

      if (context.state === "suspended") {
        await context.resume().catch(() => undefined);
      }

      source = context.createMediaStreamSource(stream);

      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);

      const sample = () => {
        if (cancelled || !analyser) {
          return;
        }

        analyser.getFloatTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let index = 0; index < dataArray.length; index += 1) {
          const value = dataArray[index];
          sumSquares += value * value;
        }

        const rms = Math.sqrt(sumSquares / dataArray.length);
        updateFromLevel(rms);

        rafId = window.requestAnimationFrame(sample);
      };

      sample();
    };

    if (AudioContextCtor && audioElement) {
      startAnalyser();
    }

    fallbackInterval = window.setInterval(() => {
      const getter = voiceSession.getLatestAudioLevel;
      const latest = typeof getter === "function" ? getter.call(voiceSession) : undefined;

      if (typeof latest === "number" && Number.isFinite(latest)) {
        noLevelCount = 0;
        updateFromLevel(latest);
        return;
      }

      noLevelCount += 1;
      if (noLevelCount > 6) {
        updateFromLevel(0);
      }
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      cleanupAnalyser();
      analyserCleanupRef.current = null;
      if (fallbackInterval !== null) {
        window.clearInterval(fallbackInterval);
      }
    };
  }, [audioElement, pollIntervalMs, session, status]);

  return voiceActivity;
}
