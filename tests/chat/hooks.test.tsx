import { EventEmitter } from "node:events";

import { act, renderHook } from "@testing-library/react";

import { useMarkdownExperience } from "@/app/lib/hooks/useMarkdownExperience";
import { useMcpTools } from "@/app/lib/hooks/useMcpTools";
import { useVoiceActivityMeter } from "@/app/lib/hooks/useVoiceActivityMeter";
import type { ConnectionStatus } from "@/app/components/SessionControls";
import type { RealtimeSession } from "@openai/agents/realtime";

class MockAdapter extends EventEmitter {
  refreshCatalog = jest.fn().mockResolvedValue(undefined);

  attach = jest.fn().mockResolvedValue(undefined);

  detach = jest.fn();

  subscribe(listener: (event: unknown) => void) {
    this.on("event", listener);
    return () => this.off("event", listener);
  }

  emitEvent(event: unknown) {
    this.emit("event", event);
  }
}

describe("hook: useMarkdownExperience", () => {
  it("loads markdown document and clears loading state", async () => {
    const { result } = renderHook(() =>
      useMarkdownExperience({ session: null, engagementDelayMs: 10 }),
    );

    expect(result.current.isMarkdownLoading).toBe(false);

    await act(async () => {
      await result.current.showMarkdownTool.execute({ markdown: "Hello world" });
    });

    expect(result.current.markdownDocument?.markdown).toBe("Hello world");
    expect(result.current.isMarkdownLoading).toBe(false);
  });
});

describe("hook: useMcpTools", () => {
  it("captures tools and runs, announcing availability", async () => {
    const adapter = new MockAdapter();
    const onToolsAnnounced = jest.fn();
    const { result } = renderHook(() =>
      useMcpTools({
        session: null,
        adapter,
        getStatus: () => "idle" as ConnectionStatus,
        onToolsAnnounced,
      }),
    );

    await act(async () => Promise.resolve());

    act(() => {
      adapter.emitEvent({
        type: "tools-changed",
        tools: [
          {
            id: "demo",
            name: "demo",
            description: "test tool",
            inputSchema: null,
            permissions: [],
            serverId: "s1",
          },
        ],
      });
    });

    expect(result.current.mcpTools).toHaveLength(1);
    expect(result.current.toolsInitialized).toBe(true);
    expect(onToolsAnnounced).toHaveBeenCalledWith(1);

    act(() => {
      adapter.emitEvent({
        type: "run-updated",
        run: {
          runId: "r1",
          toolId: "demo",
          toolName: "demo",
          serverId: "s1",
          status: "running",
          startedAt: Date.now(),
        },
      });
    });

    expect(result.current.toolRuns[0]?.status).toBe("running");
  });
});

describe("hook: useVoiceActivityMeter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reports active voice when latest audio level is present", () => {
    const session = {
      getLatestAudioLevel: jest.fn().mockReturnValue(0.2),
    } as unknown as RealtimeSession;

    const { result, rerender } = renderHook(
      ({ status }) =>
        useVoiceActivityMeter({
          session,
          status,
          audioElement: null,
          pollIntervalMs: 10,
        }),
      { initialProps: { status: "connected" as ConnectionStatus } },
    );

    act(() => {
      jest.advanceTimersByTime(20);
    });

    expect(result.current.hasMetrics).toBe(true);
    expect(result.current.active).toBe(true);

    rerender({ status: "idle" as ConnectionStatus });
    expect(result.current.hasMetrics).toBe(false);
    expect(result.current.active).toBe(false);
  });
});
