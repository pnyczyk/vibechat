"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Typography from "@mui/material/Typography";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import styles from "./chat-client.module.css";

import {
  SessionControls,
  SessionFeedback,
  ConnectionStatus,
} from "./components/SessionControls";
import { VoiceMeter } from "./components/VoiceMeter";

type VoiceMeterState = {
  level: number;
  active: boolean;
  hasMetrics: boolean;
};

type VoiceActivitySession = RealtimeSession & {
  on?: (event: string, listener: (payload: unknown) => void) => void;
  off?: (event: string, listener: (payload: unknown) => void) => void;
  removeListener?: (event: string, listener: (payload: unknown) => void) => void;
  addEventListener?: (event: string, listener: (payload: unknown) => void) => void;
  removeEventListener?: (event: string, listener: (payload: unknown) => void) => void;
  getLatestAudioLevel?: () => number | null | undefined;
};

const defaultVoiceMeterState: VoiceMeterState = {
  level: 0,
  active: false,
  hasMetrics: false,
};

type NormalizedVoicePayload = {
  level?: number;
  active?: boolean;
};

const voiceActivityEventCandidates = [
  "voice-activity",
  "audio-activity",
  "audio.activity",
];

const clampLevel = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
};

const normalizeVoicePayload = (payload: unknown): NormalizedVoicePayload => {
  if (typeof payload === "number") {
    return { level: clampLevel(payload) };
  }

  if (!payload || typeof payload !== "object") {
    return {};
  }

  const data = payload as Record<string, unknown>;
  const levelCandidate = [
    data.level,
    data.volume,
    data.value,
    data.amplitude,
  ].find((candidate) => typeof candidate === "number" && Number.isFinite(candidate));

  const state =
    typeof data.state === "string" ? data.state.toLowerCase() : undefined;

  let active: boolean | undefined;
  if (typeof data.active === "boolean") {
    active = data.active;
  } else if (typeof data.speaking === "boolean") {
    active = data.speaking;
  } else if (state) {
    active = state !== "idle" && state !== "inactive";
  }

  return {
    level:
      typeof levelCandidate === "number" ? clampLevel(levelCandidate) : undefined,
    active,
  };
};

export function ChatClient() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [muted, setMuted] = useState(false);
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [voiceMeter, setVoiceMeter] = useState<VoiceMeterState>(
    defaultVoiceMeterState,
  );

  useEffect(() => {
    return () => {
      session?.close();
    };
  }, [session]);

  const agent = useMemo(() => {
    return new RealtimeAgent({
      name: "Assistant",
      instructions: "Mów po polsku i odpowiadaj głosem. Bądź serdeczny.",
    });
  }, []);

  const handleConnect = useCallback(async () => {
    if (status === "connecting" || status === "connected") {
      return;
    }

    if (session) {
      session.close();
      setSession(null);
    }

    setError(null);
    setFeedback(null);
    setMuted(false);
    setStatus("connecting");

    try {
      const response = await fetch("/api/realtime-token");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message =
          typeof body.error === "string"
            ? body.error
            : `Token endpoint returned ${response.status}`;
        throw new Error(message);
      }

      const secret = await response.json();
      const apiKey =
        typeof secret?.value === "string"
          ? secret.value
          : secret?.client_secret?.value;
      if (!apiKey) {
        throw new Error("Realtime token response missing value");
      }

      const newSession = new RealtimeSession(agent, {
        model: "gpt-realtime",
      });

      await newSession.connect({ apiKey });
      setSession(newSession);
      setStatus("connected");
      setFeedback({ message: "Connected to session", severity: "success" });
      setMuted(Boolean(newSession.muted));
      setVoiceMeter(defaultVoiceMeterState);
    } catch (err) {
      console.error("Failed to connect realtime session", err);
      setStatus("error");
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
      setFeedback({ message, severity: "error" });
      setVoiceMeter(defaultVoiceMeterState);
    }
  }, [agent, session, status]);

  const handleDisconnect = useCallback(() => {
    session?.close();
    setSession(null);
    setStatus("idle");
    setError(null);
    setMuted(false);
    setFeedback({ message: "Disconnected from session", severity: "success" });
    setVoiceMeter(defaultVoiceMeterState);
  }, [session]);

  const handleToggleMute = useCallback(() => {
    if (!session) {
      setFeedback({
        message: "Connect to enable microphone",
        severity: "error",
      });
      return;
    }

    try {
      const nextMuted = !muted;
      session.mute(nextMuted);
      setMuted(nextMuted);
      setFeedback({
        message: nextMuted ? "Microphone muted" : "Microphone active",
        severity: "success",
      });
    } catch (err) {
      console.error("Failed to toggle microphone", err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      setFeedback({ message, severity: "error" });
      setError(message);
    }
  }, [muted, session]);

  const handleFeedbackClose = useCallback(() => {
    setFeedback(null);
  }, []);

  useEffect(() => {
    if (!session || status !== "connected") {
      setVoiceMeter(defaultVoiceMeterState);
      return;
    }

    setVoiceMeter(defaultVoiceMeterState);

    let disposed = false;
    const voiceSession = session as VoiceActivitySession;
    const cleanups: Array<() => void> = [];

    const handlePayload = (payload: unknown) => {
      if (disposed) {
        return;
      }

      const normalized = normalizeVoicePayload(payload);
      const hasLevel = typeof normalized.level === "number";

      setVoiceMeter((previous) => {
        const nextLevel = hasLevel
          ? normalized.level ?? 0
          : normalized.active === true
            ? Math.max(previous.level, 0.65)
            : normalized.active === false
              ? 0
              : previous.level;

        const nextActive =
          typeof normalized.active === "boolean"
            ? normalized.active
            : hasLevel
              ? (normalized.level ?? 0) > 0.12
              : previous.active;

        const nextHasMetrics = hasLevel
          ? true
          : typeof normalized.active === "boolean"
            ? true
            : previous.hasMetrics;

        if (
          nextLevel === previous.level &&
          nextActive === previous.active &&
          nextHasMetrics === previous.hasMetrics
        ) {
          return previous;
        }

        return {
          level: nextLevel,
          active: nextActive,
          hasMetrics: nextHasMetrics,
        };
      });
    };

    const attachListener = (eventName: string) => {
      let attached = false;

      if (typeof voiceSession.on === "function") {
        const listener = (payload: unknown) => {
          handlePayload(payload);
        };
        voiceSession.on(eventName, listener);
        cleanups.push(() => {
          if (typeof voiceSession.off === "function") {
            voiceSession.off(eventName, listener);
          } else if (typeof voiceSession.removeListener === "function") {
            voiceSession.removeListener(eventName, listener);
          }
        });
        attached = true;
      } else if (typeof voiceSession.addEventListener === "function") {
        const listener = (payload: unknown) => {
          handlePayload(payload);
        };
        voiceSession.addEventListener(eventName, listener);
        cleanups.push(() => {
          if (typeof voiceSession.removeEventListener === "function") {
            voiceSession.removeEventListener(eventName, listener);
          }
        });
        attached = true;
      }

      return attached;
    };

    const attachedEvents = voiceActivityEventCandidates.map((eventName) =>
      attachListener(eventName),
    );
    const hasListener = attachedEvents.some(Boolean);

    if (!hasListener && typeof window !== "undefined") {
      const poller =
        typeof voiceSession.getLatestAudioLevel === "function"
          ? window.setInterval(() => {
              const value = voiceSession.getLatestAudioLevel?.();
              if (typeof value === "number" && Number.isFinite(value)) {
                handlePayload({ level: value });
              }
            }, 250)
          : null;

      if (poller) {
        cleanups.push(() => {
          window.clearInterval(poller);
        });
      }
    }

    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => {
        cleanup();
      });
    };
  }, [session, status]);

  return (
    <section className={styles.layout} aria-labelledby="chat-title">
      <div className={styles.canvas}>
        <header className={styles.header}>
          <Typography
            id="chat-title"
            variant="h3"
            component="h1"
            className={styles.title}
          >
            VibeChat
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Connect to start a realtime voice session or explore the workspace
            while we prepare new modules.
          </Typography>
        </header>

        <div className={styles.surface} role="presentation">
          <Typography variant="body2" color="text.secondary">
            Voice interaction canvas reserved for upcoming live session
            visualization.
          </Typography>
        </div>

        <footer className={styles.status} aria-live="polite">
          <div className={styles.statusText}>
            <Typography variant="body2">Status: {status}</Typography>
            {error ? (
              <Typography variant="body2" color="error">
                Error: {error}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Allow microphone access when prompted to keep the session ready.
              </Typography>
            )}
          </div>
          <div className={styles.voiceMeterWrapper}>
            <VoiceMeter
              active={voiceMeter.active}
              level={voiceMeter.level}
              hasMetrics={voiceMeter.hasMetrics}
            />
          </div>
        </footer>
      </div>

      <aside className={styles.controlRail} aria-label="Session controls">
        <div className={styles.controlRailInner}>
          <SessionControls
            status={status}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            muted={muted}
            onToggleMute={handleToggleMute}
            feedback={feedback}
            onFeedbackClose={handleFeedbackClose}
          />
        </div>
      </aside>
    </section>
  );
}
