"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Typography from "@mui/material/Typography";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import styles from "./chat-client.module.css";

import {
  SessionControls,
  SessionFeedback,
  ConnectionStatus,
} from "./components/SessionControls";
import { TranscriptDrawer } from "./components/TranscriptDrawer";
import { TranscriptStore, type TranscriptEntry } from "./lib/transcript-store";
import { createRealtimeSession } from "./lib/realtime-session-factory";

type VoiceActivityState = {
  level: number;
  active: boolean;
  hasMetrics: boolean;
};

type VoiceActivitySession = RealtimeSession & {
  getLatestAudioLevel?: () => number | null | undefined;
};

const defaultVoiceActivityState: VoiceActivityState = {
  level: 0,
  active: false,
  hasMetrics: false,
};

const clampLevel = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
};

export function ChatClient() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [muted, setMuted] = useState(false);
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const transcriptStore = useMemo(() => new TranscriptStore(), []);
  const [voiceActivity, setVoiceActivity] = useState<VoiceActivityState>(
    defaultVoiceActivityState,
  );
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const audioElement = useState(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const element = document.createElement("audio");
    element.autoplay = true;
    (element as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    element.style.display = "none";
    document.body.appendChild(element);
    return element;
  })[0];
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.srcObject = null;
        if (audioElement.isConnected) {
          audioElement.remove();
        }
      }
    };
  }, [audioElement]);

  useEffect(() => {
    return () => {
      session?.close();
    };
  }, [session]);

  useEffect(() => {
    transcriptStore.setSession(session);

    return () => {
      transcriptStore.setSession(null);
    };
  }, [session, transcriptStore]);

  useEffect(() => {
    const unsubscribe = transcriptStore.subscribe((entries) => {
      setTranscriptEntries(entries);
    });

    return unsubscribe;
  }, [transcriptStore]);

  useEffect(() => {
    return () => {
      transcriptStore.dispose();
    };
  }, [transcriptStore]);

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

    let newSession: RealtimeSession | null = null;

    try {
      const { session: createdSession, requiresToken } = createRealtimeSession(
        agent,
        audioElement,
      );

      newSession = createdSession;

      let apiKey = "mock-api-key";
      if (requiresToken) {
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
        const resolvedKey =
          typeof secret?.value === "string"
            ? secret.value
            : secret?.client_secret?.value;
        if (!resolvedKey) {
          throw new Error("Realtime token response missing value");
        }
        apiKey = resolvedKey;
      }

      await newSession.connect({ apiKey, model: "gpt-realtime" });
      setSession(newSession);
      setStatus("connected");
      setFeedback({ message: "Connected to session", severity: "success" });
      setMuted(Boolean(newSession.muted));
      setVoiceActivity(defaultVoiceActivityState);
    } catch (err) {
      console.error("Failed to connect realtime session", err);
      newSession?.close();
      setStatus("error");
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
      setFeedback({ message, severity: "error" });
      setVoiceActivity(defaultVoiceActivityState);
    }
  }, [agent, audioElement, session, status]);

  const handleDisconnect = useCallback(() => {
    session?.close();
    setSession(null);
    setStatus("idle");
    setError(null);
    setMuted(false);
    setFeedback({ message: "Disconnected from session", severity: "success" });
    setVoiceActivity(defaultVoiceActivityState);
    setIsTranscriptOpen(false);
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

  const handleToggleTranscript = useCallback(() => {
    setIsTranscriptOpen((previous) => !previous);
  }, []);

  const handleCloseTranscript = useCallback(() => {
    setIsTranscriptOpen(false);
  }, []);

  const handleSendTranscriptMessage = useCallback(
    async (text: string) => {
      try {
        transcriptStore.sendTextMessage(text);
        setFeedback({ message: "Message sent", severity: "success" });
      } catch (err) {
        console.error("Failed to send transcript message", err);
        const message =
          err instanceof Error ? err.message : "Failed to send transcript message";
        setFeedback({ message, severity: "error" });
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [transcriptStore],
  );

  const handleFeedbackClose = useCallback(() => {
    setFeedback(null);
  }, []);

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
      window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

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
          ? previous.level * 0.7 + level * 0.3
          : level;
        const active = smoothed > 0.06;

        if (
          previous.hasMetrics &&
          Math.abs(previous.level - smoothed) < 0.005 &&
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
    }, 120);

    return () => {
      cancelled = true;
      cleanupAnalyser();
      analyserCleanupRef.current = null;
      if (fallbackInterval !== null) {
        window.clearInterval(fallbackInterval);
      }
    };
  }, [audioElement, session, status]);

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
            voiceActive={voiceActivity.active}
            voiceHasMetrics={voiceActivity.hasMetrics}
            transcriptOpen={isTranscriptOpen}
            onToggleTranscript={handleToggleTranscript}
          />
        </div>
      </aside>
      <TranscriptDrawer
        open={isTranscriptOpen}
        onClose={handleCloseTranscript}
        entries={transcriptEntries}
        onSendMessage={handleSendTranscriptMessage}
        inputDisabled={status !== "connected"}
      />
    </section>
  );
}
