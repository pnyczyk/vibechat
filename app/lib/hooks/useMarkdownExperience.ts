import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeSession } from "@openai/agents/realtime";

import { logTelemetry } from "@/app/lib/analytics";
import {
  MarkdownStore,
  type MarkdownDocument,
  createShowMarkdownTool,
} from "@/app/lib/markdown-store";

type UseMarkdownExperienceOptions = {
  session: RealtimeSession | null;
  engagementDelayMs?: number;
  exposeGlobal?: boolean;
};

type UseMarkdownExperienceResult = {
  showMarkdownTool: ReturnType<typeof createShowMarkdownTool>;
  markdownDocument: MarkdownDocument | null;
  isMarkdownLoading: boolean;
  markdownStore: MarkdownStore;
};

/**
  * Manages MarkdownStore wiring, loading state, telemetry, and tool instance.
  * Keeps the ChatClient focused on orchestration rather than rendering details.
  */
export function useMarkdownExperience({
  session,
  engagementDelayMs = 5_000,
  exposeGlobal = true,
}: UseMarkdownExperienceOptions): UseMarkdownExperienceResult {
  const markdownStore = useMemo(() => new MarkdownStore(), []);
  const [markdownDocument, setMarkdownDocument] = useState<MarkdownDocument | null>(null);
  const [isMarkdownLoading, setIsMarkdownLoading] = useState(false);
  const isMountedRef = useRef(true);
  const markdownLoadStartRef = useRef<number | null>(null);
  const lastRenderSignatureRef = useRef<string | null>(null);
  const engagementTimerRef = useRef<NodeJS.Timeout | null>(null);
  const engagementDocRef = useRef<string | null>(null);
  const engagementStartRef = useRef<number | null>(null);

  const clearEngagementTimer = useCallback(() => {
    if (engagementTimerRef.current) {
      clearTimeout(engagementTimerRef.current);
      engagementTimerRef.current = null;
    }
    engagementDocRef.current = null;
    engagementStartRef.current = null;
  }, []);

  const scheduleEngagement = useCallback(
    (documentId: string) => {
      clearEngagementTimer();
      engagementDocRef.current = documentId;
      engagementStartRef.current = Date.now();
      engagementTimerRef.current = setTimeout(() => {
        const startedAt = engagementStartRef.current ?? Date.now();
        const durationMs = Math.max(0, Date.now() - startedAt);
        logTelemetry("session_markdown_engagement", {
          documentId,
          durationMs,
        });
        engagementTimerRef.current = null;
        engagementDocRef.current = null;
        engagementStartRef.current = null;
      }, engagementDelayMs);
    },
    [clearEngagementTimer, engagementDelayMs],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearEngagementTimer();
    };
  }, [clearEngagementTimer]);

  useEffect(() => {
    markdownStore.setSession(session);
    return () => {
      markdownStore.setSession(null);
    };
  }, [markdownStore, session]);

  const showMarkdownTool = useMemo(() => {
    const realtimeTool = createShowMarkdownTool(markdownStore);
    const originalExecute = realtimeTool.execute.bind(realtimeTool);

    Object.defineProperty(realtimeTool, "execute", {
      value: async (input: unknown) => {
        if (isMountedRef.current) {
          setIsMarkdownLoading(true);
        }
        markdownLoadStartRef.current = Date.now();
        try {
          return await originalExecute(input);
        } catch (error) {
          markdownLoadStartRef.current = null;
          throw error;
        } finally {
          if (isMountedRef.current) {
            setIsMarkdownLoading(false);
          }
        }
      },
      enumerable: true,
      configurable: true,
    });

    return realtimeTool;
  }, [markdownStore]);

  useEffect(() => {
    const unsubscribe = markdownStore.subscribe((document) => {
      setMarkdownDocument(document);
      if (!document) {
        if (isMountedRef.current) {
          setIsMarkdownLoading(false);
        }
        lastRenderSignatureRef.current = null;
        clearEngagementTimer();
        return;
      }

      if (isMountedRef.current) {
        setIsMarkdownLoading(false);
      }

      const now = Date.now();
      const startedAt = markdownLoadStartRef.current ?? document.updatedAt ?? now;
      const latencyMs = Math.max(0, now - startedAt);
      markdownLoadStartRef.current = null;
      const signature = `${document.id}:${document.updatedAt}`;
      if (lastRenderSignatureRef.current !== signature) {
        lastRenderSignatureRef.current = signature;
        logTelemetry("session_markdown_rendered", {
          documentId: document.id,
          title: document.title ?? null,
          bytes: document.bytes,
          latencyMs,
        });
      }
      scheduleEngagement(document.id);
    });

    return unsubscribe;
  }, [clearEngagementTimer, markdownStore, scheduleEngagement]);

  useEffect(() => {
    if (!exposeGlobal || typeof window === "undefined") {
      return;
    }

    const globalWindow = window as typeof window & {
      __vibeMarkdownStore?: MarkdownStore;
    };
    globalWindow.__vibeMarkdownStore = markdownStore;

    return () => {
      if (globalWindow.__vibeMarkdownStore === markdownStore) {
        delete globalWindow.__vibeMarkdownStore;
      }
    };
  }, [exposeGlobal, markdownStore]);

  return {
    showMarkdownTool,
    markdownDocument,
    isMarkdownLoading,
    markdownStore,
  };
}
