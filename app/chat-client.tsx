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

export function ChatClient() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [session, setSession] = useState<RealtimeSession | null>(null);

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
    } catch (err) {
      console.error("Failed to connect realtime session", err);
      setStatus("error");
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
      setFeedback({ message, severity: "error" });
    }
  }, [agent, session, status]);

  const handleDisconnect = useCallback(() => {
    session?.close();
    setSession(null);
    setStatus("idle");
    setError(null);
    setFeedback({ message: "Disconnected from session", severity: "success" });
  }, [session]);

  const handleFeedbackClose = useCallback(() => {
    setFeedback(null);
  }, []);

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
        </footer>
      </div>

      <aside className={styles.controlRail} aria-label="Session controls">
        <div className={styles.controlRailInner}>
          <SessionControls
            status={status}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            feedback={feedback}
            onFeedbackClose={handleFeedbackClose}
          />
        </div>
      </aside>
    </section>
  );
}
