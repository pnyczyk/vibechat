"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Typography from "@mui/material/Typography";
import { RealtimeAgent, RealtimeSession, tool as createAgentTool } from "@openai/agents/realtime";
import dynamic from "next/dynamic";
import styles from "./chat-client.module.css";

import { SessionControls, SessionFeedback, ConnectionStatus } from "./components/SessionControls";
import { EntryOverlay } from "./components/EntryOverlay";
import type { TranscriptDrawerProps } from "./components/TranscriptDrawer";
import { MarkdownViewer } from "./components/MarkdownViewer";
import { TranscriptStore } from "./lib/transcript-store";
import { useMarkdownExperience } from "./lib/hooks/useMarkdownExperience";
import { useMcpTools } from "./lib/hooks/useMcpTools";
import { useTranscriptStore as useTranscriptStoreHook } from "./lib/hooks/useTranscriptStore";
import { useHiddenAudioElement } from "./lib/hooks/useHiddenAudioElement";
import { useVoiceActivityMeter } from "./lib/hooks/useVoiceActivityMeter";
import { McpAdapter } from "./lib/voice-agent/mcp-adapter";
import { logTelemetry, type TelemetryTransport } from "./lib/analytics";
import { createRealtimeSession } from "./lib/realtime-session-factory";
import { useThemeController } from "./providers";

const TranscriptDrawer = dynamic<TranscriptDrawerProps>(
  () =>
    import("./components/TranscriptDrawer").then((module) => module.TranscriptDrawer),
  { ssr: false, loading: () => null },
);

const defaultToolParameters: Record<string, unknown> = Object.freeze({
  type: "object",
  properties: {},
  additionalProperties: true,
});

export function ChatClient() {
  const { mode: themeMode, toggle: toggleTheme } = useThemeController();
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [muted, setMuted] = useState(false);
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const transcriptStore = useMemo(() => new TranscriptStore(), []);
  const mcpAdapter = useMemo(() => {
    const supportsFetch =
      typeof window !== "undefined" && typeof window.fetch === "function";
    const resourceEventsUrl = supportsFetch ? "/api/mcp/resource-events" : null;
    return new McpAdapter({ resourceEventsUrl });
  }, []);
  const [agent, setAgent] = useState<RealtimeAgent | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isTranscriptReady, setIsTranscriptReady] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const entryStartRef = useRef<number | null>(null);
  const entryTimestampRef = useRef<string | null>(null);
  const voiceStateRef = useRef<"waiting" | "idle" | "active">("waiting");
  const statusRef = useRef<ConnectionStatus>("idle");
  statusRef.current = status;
  const audioElement = useHiddenAudioElement();
  const { showMarkdownTool, markdownDocument, isMarkdownLoading } = useMarkdownExperience({
    session,
  });
  const transcriptEntries = useTranscriptStoreHook({
    session,
    store: transcriptStore,
  });
  const handleToolsAnnounced = useCallback(
    (count: number) =>
      setFeedback({
        message: `Found ${count} MCP tools`,
        severity: "success",
      }),
    [setFeedback],
  );
  const { mcpTools, toolRuns, toolsInitialized } = useMcpTools({
    session,
    adapter: mcpAdapter,
    getStatus: () => statusRef.current,
    onToolsAnnounced: handleToolsAnnounced,
  });
  const voiceActivity = useVoiceActivityMeter({
    session,
    status,
    audioElement,
  });

  const agentTools = useMemo(
    () =>
      [
        showMarkdownTool,
        ...mcpTools.map((toolSummary) => {
          const parameters =
            toolSummary.inputSchema && Object.keys(toolSummary.inputSchema).length > 0
              ? toolSummary.inputSchema
              : defaultToolParameters;

        const execute = async (args: unknown) => {
          try {
            return await mcpAdapter.runTool(toolSummary.id, args);
          } catch (error) {
            console.warn("[mcp-adapter] tool execution failed", {
              tool: toolSummary.name,
              error,
            });
            throw error;
          }
        };

        const realtimeTool = createAgentTool({
          name: toolSummary.name,
          description: toolSummary.description ?? "",
          parameters,
          async execute(input) {
            return execute(input);
          },
        });

        const originalInvoke = realtimeTool.invoke.bind(realtimeTool);

        Object.defineProperty(realtimeTool, "execute", {
          value: execute,
          enumerable: true,
          configurable: true,
        });

        Object.defineProperty(realtimeTool, "parameters", {
          value: parameters,
          enumerable: true,
          configurable: true,
        });

        Object.defineProperty(realtimeTool, "invoke", {
          value: originalInvoke,
          enumerable: false,
          configurable: true,
          writable: true,
        });

        return realtimeTool;
      }),
      ],
    [mcpAdapter, mcpTools, showMarkdownTool],
  );

  useEffect(() => {
    if (!toolsInitialized) {
      return;
    }

    const baseConfig = {
      name: "Assistant",
    };

    const config =
      agentTools.length > 0
        ? { ...baseConfig, tools: agentTools }
        : baseConfig;

    const debugConfig =
      agentTools.length > 0
        ? {
            ...baseConfig,
            tools: agentTools.map((tool) => ({
              type: tool.type,
              name: tool.name,
              description: tool.description,
              parameters: (tool as unknown as { parameters: unknown }).parameters,
              execute: (tool as unknown as { execute?: unknown }).execute,
            })),
          }
        : baseConfig;

    console.log("[chat-client] initializing agent with config", debugConfig);
    setAgent(new RealtimeAgent(config));
  }, [agentTools, toolsInitialized]);

  useEffect(() => {
    return () => {
      session?.close();
    };
  }, [session]);

  useEffect(() => {
    if ((isTranscriptOpen || transcriptEntries.length > 0) && !isTranscriptReady) {
      setIsTranscriptReady(true);
    }
  }, [isTranscriptOpen, isTranscriptReady, transcriptEntries.length]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 768px)");

    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsCompactLayout(event.matches);
    };

    handleChange(mediaQuery);

    if (typeof mediaQuery.addEventListener === "function") {
      const listener = handleChange as (event: MediaQueryListEvent) => void;
      mediaQuery.addEventListener("change", listener);
      return () => {
        mediaQuery.removeEventListener("change", listener);
      };
    }

    const legacyListener = (event: MediaQueryListEvent) => handleChange(event);
    mediaQuery.addListener(legacyListener);
    return () => {
      mediaQuery.removeListener(legacyListener);
    };
  }, []);

  useEffect(() => {
    const overlayVisible = status === "idle" || status === "error";
    if (overlayVisible && entryStartRef.current === null) {
      const highResNow =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      entryStartRef.current = highResNow;
      const startedAt = new Date().toISOString();
      entryTimestampRef.current = startedAt;
      logTelemetry("session_entry_started", { startedAt });
    }
  }, [status]);

  useEffect(() => {
    const state = voiceActivity.hasMetrics
      ? voiceActivity.active
        ? "active"
        : "idle"
      : "waiting";

    if (voiceStateRef.current !== state) {
      voiceStateRef.current = state;
      logTelemetry("voice_activity_transition", {
        state,
        hasMetrics: voiceActivity.hasMetrics,
      });
    }
  }, [voiceActivity]);

  const handleConnect = useCallback(async () => {
    if (status === "connecting" || status === "connected") {
      return;
    }

    if (!agent) {
      setFeedback({
        message: "Trwa przygotowywanie narzędzi MCP, spróbuj ponownie za chwilę",
        severity: "error",
      });
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
    const startTime =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    let transport: TelemetryTransport = "realtime";

    try {
      const { session: createdSession, requiresToken } = createRealtimeSession(
        agent,
        audioElement,
      );

      newSession = createdSession;
      transport = requiresToken ? "realtime" : "mock";

      logTelemetry("session_connect_attempt", { transport });

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
      voiceStateRef.current = "waiting";

      const entryStart = entryStartRef.current;
      const nowHighRes =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      const entryLatencyMs =
        typeof entryStart === "number" ? Math.max(0, nowHighRes - entryStart) : null;
      entryStartRef.current = null;
      entryTimestampRef.current = null;

      const endTime =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      const durationMs = Math.max(0, endTime - startTime);
      logTelemetry("session_connect_success", { durationMs, transport, entryLatencyMs });
    } catch (err) {
      console.error("Failed to connect realtime session", err);
      newSession?.close();
      setStatus("error");
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
      setFeedback({ message, severity: "error" });
      voiceStateRef.current = "waiting";
      entryStartRef.current = null;
      entryTimestampRef.current = null;
      logTelemetry("session_connect_failure", { message, transport });
    }
  }, [agent, audioElement, session, status]);

  const handleDisconnect = useCallback(() => {
    session?.close();
    setSession(null);
    setStatus("idle");
    setError(null);
    setMuted(false);
    setFeedback({ message: "Disconnected from session", severity: "success" });
    setIsTranscriptOpen(false);
    mcpAdapter.detach();
    voiceStateRef.current = "waiting";
    entryStartRef.current = null;
    entryTimestampRef.current = null;
    logTelemetry("voice_activity_transition", { state: "waiting", hasMetrics: false });
    logTelemetry("session_disconnect", { reason: "user" });
  }, [session, mcpAdapter]);

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
      logTelemetry(nextMuted ? "session_mute_enabled" : "session_mute_disabled", {});
    } catch (err) {
      console.error("Failed to toggle microphone", err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      setFeedback({ message, severity: "error" });
      setError(message);
    }
  }, [logTelemetry, muted, session]);

  const handleToggleTranscript = useCallback(() => {
    setIsTranscriptOpen((previous) => {
      const next = !previous;
      logTelemetry(next ? "transcript_opened" : "transcript_closed", {});
      return next;
    });
  }, [logTelemetry]);

  const handleCloseTranscript = useCallback(() => {
    setIsTranscriptOpen((previous) => {
      if (!previous) {
        return previous;
      }
      logTelemetry("transcript_closed", {});
      return false;
    });
  }, [logTelemetry]);

  const handleToggleTheme = useCallback(() => {
    const nextMode = themeMode === "dark" ? "light" : "dark";
    logTelemetry("session_theme_selected", { mode: nextMode, source: "toggle" });
    toggleTheme();
  }, [themeMode, toggleTheme]);

  const handleSendTranscriptMessage = useCallback(
    async (text: string) => {
      try {
        transcriptStore.sendTextMessage(text);
        setFeedback({ message: "Message sent", severity: "success" });
        logTelemetry("transcript_message_sent", { length: text.length });
      } catch (err) {
        console.error("Failed to send transcript message", err);
        const message =
          err instanceof Error ? err.message : "Failed to send transcript message";
        setFeedback({ message, severity: "error" });
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [logTelemetry, transcriptStore],
  );

  const handleFeedbackClose = useCallback(() => {
    setFeedback(null);
  }, []);

  const isDimmed = status !== "connected";

  return (
    <div
      className={styles.layout}
      data-testid="chat-layout"
      data-layout={isCompactLayout ? "compact" : "wide"}
      data-dimmed={isDimmed ? "true" : "false"}
    >
      <main className={styles.canvas} aria-labelledby="chat-title">
        <EntryOverlay status={status} error={error} onConnect={handleConnect} />
        <header className={styles.header}>
          <Typography
            id="chat-title"
            variant="h3"
            component="h1"
            className={styles.title}
          >
            VibeChat
          </Typography>
        </header>

        <div className={styles.surface} role="presentation">
          <MarkdownViewer document={markdownDocument} isLoading={isMarkdownLoading} />
        </div>

        {toolRuns.length > 0 && (
          <div
            className={styles.toolRuns}
            data-testid="mcp-tool-runs"
            title={mcpTools.map((tool) => tool.name).join(", ")}
          >
            {toolRuns.slice(-3).map((run) => (
              <div
                key={run.runId}
                className={styles.toolRun}
                data-status={run.status}
              >
                <span className={styles.toolRunName}>{run.toolName}</span>
                <span className={styles.toolRunMessage}>{run.message}</span>
              </div>
            ))}
          </div>
        )}
      </main>

      <aside className={styles.controlRail} aria-label="Session controls">
        <div className={styles.controlRailInner}>
          <SessionControls
            status={status}
            onDisconnect={handleDisconnect}
            muted={muted}
            onToggleMute={handleToggleMute}
            feedback={feedback}
            onFeedbackClose={handleFeedbackClose}
            voiceActive={voiceActivity.active}
            voiceHasMetrics={voiceActivity.hasMetrics}
            voiceLevel={voiceActivity.level}
            transcriptOpen={isTranscriptOpen}
            onToggleTranscript={handleToggleTranscript}
            themeMode={themeMode}
            onToggleTheme={handleToggleTheme}
          />
        </div>
      </aside>
      {(isTranscriptReady || isTranscriptOpen) && (
        <TranscriptDrawer
          open={isTranscriptOpen}
          onClose={handleCloseTranscript}
          entries={transcriptEntries}
          onSendMessage={handleSendTranscriptMessage}
          inputDisabled={status !== "connected"}
        />
      )}
    </div>
  );
}
