import { useEffect, useMemo, useState } from "react";
import type { RealtimeSession } from "@openai/agents/realtime";

import type { ConnectionStatus } from "@/app/components/SessionControls";
import {
  McpAdapter,
  type McpToolSummary,
  type ToolRunState,
} from "@/app/lib/voice-agent/mcp-adapter";

type UseMcpToolsOptions = {
  session: RealtimeSession | null;
  adapter: McpAdapter;
  getStatus?: () => ConnectionStatus;
  onToolsAnnounced?: (count: number) => void;
  exposeGlobal?: boolean;
};

type UseMcpToolsResult = {
  mcpTools: McpToolSummary[];
  toolRuns: ToolRunState[];
  toolsInitialized: boolean;
};

/**
 * Manages MCP catalog/runs lifecycle and subscribes to adapter events.
 * Keeps ChatClient lean while preserving existing behavior and announcements.
 */
export function useMcpTools({
  session,
  adapter,
  getStatus,
  onToolsAnnounced,
  exposeGlobal = true,
}: UseMcpToolsOptions): UseMcpToolsResult {
  const [mcpTools, setMcpTools] = useState<McpToolSummary[]>([]);
  const [toolRuns, setToolRuns] = useState<ToolRunState[]>([]);
  const [toolsInitialized, setToolsInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await adapter.refreshCatalog();
      } catch (error) {
        if (!cancelled) {
          console.warn("[mcp-adapter] catalog refresh failed", error);
        }
      } finally {
        if (!cancelled) {
          setToolsInitialized(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adapter]);

  useEffect(() => {
    if (!session) {
      adapter.detach();
      setToolRuns([]);
      return;
    }

    void (async () => {
      try {
        await adapter.attach(session);
      } catch (error) {
        console.warn("[mcp-adapter] failed to attach", error);
      }
    })();

    return () => {
      adapter.detach();
    };
  }, [adapter, session]);

  useEffect(() => {
    let isFirstSync = true;
    const unsubscribe = adapter.subscribe((event) => {
      if (event.type === "tools-changed") {
        setMcpTools(event.tools);
        setToolsInitialized(true);
        const toolCount = event.tools.length;
        const shouldAnnounce =
          (!isFirstSync || toolCount > 0) && getStatus?.() !== "connected";
        if (shouldAnnounce && onToolsAnnounced) {
          onToolsAnnounced(toolCount);
        }
        isFirstSync = false;
        return;
      }

      if (event.type === "run-updated") {
        setToolRuns((prev) => {
          const next = [...prev];
          const index = next.findIndex((run) => run.runId === event.run.runId);
          const copy = { ...event.run };
          if (index === -1) {
            next.push(copy);
          } else {
            next[index] = copy;
          }
          return next;
        });
      }
    });

    return unsubscribe;
  }, [adapter, getStatus, onToolsAnnounced]);

  useEffect(() => {
    if (!exposeGlobal || typeof window === "undefined") {
      return;
    }

    const globalWindow = window as typeof window & {
      __vibeMcpAdapter?: McpAdapter;
    };
    globalWindow.__vibeMcpAdapter = adapter;

    return () => {
      if (globalWindow.__vibeMcpAdapter === adapter) {
        delete globalWindow.__vibeMcpAdapter;
      }
    };
  }, [adapter, exposeGlobal]);

  return useMemo(
    () => ({
      mcpTools,
      toolRuns,
      toolsInitialized,
    }),
    [mcpTools, toolRuns, toolsInitialized],
  );
}
