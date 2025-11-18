import { act, render, waitFor } from "@testing-library/react";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";
import { setTelemetryHandlerForTesting } from "../../app/lib/analytics";
import type { MarkdownStore } from "../../app/lib/markdown-store";

declare global {
  // eslint-disable-next-line no-var
  var __vibeMarkdownStore: MarkdownStore | undefined;
  interface Window {
    __vibeMarkdownStore?: MarkdownStore;
  }
}

const ensureMatchMedia = () => {
  if (typeof window === "undefined") {
    return;
  }
  if (!window.matchMedia) {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  }
};

describe("ChatClient markdown telemetry", () => {
  beforeAll(() => {
    ensureMatchMedia();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    setTelemetryHandlerForTesting(null);
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("emits render and engagement events", async () => {
    const handler = jest.fn();
    setTelemetryHandlerForTesting(handler);

    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    await waitFor(() => expect(globalThis.__vibeMarkdownStore).toBeDefined());
    const store = globalThis.__vibeMarkdownStore;
    expect(store).toBeDefined();

    await act(async () => {
      await store?.apply({
        title: "Weekly rollup",
        markdown: "# Weekly rollup\n\n| Metric | Value |\n| -- | -- |\n| Users | 42 |",
      });
    });

    await waitFor(() =>
      expect(handler).toHaveBeenCalledWith(
        "session_markdown_rendered",
        expect.objectContaining({
          documentId: expect.any(String),
          title: "Weekly rollup",
          bytes: expect.any(Number),
          latencyMs: expect.any(Number),
          timestamp: expect.any(String),
        }),
      ),
    );

    act(() => {
      jest.advanceTimersByTime(5_100);
    });

    await waitFor(() =>
      expect(handler).toHaveBeenCalledWith(
        "session_markdown_engagement",
        expect.objectContaining({
          documentId: expect.any(String),
          durationMs: expect.any(Number),
          timestamp: expect.any(String),
        }),
      ),
    );
  });
});
