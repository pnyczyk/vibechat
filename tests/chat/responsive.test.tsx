import { act, render } from "@testing-library/react";
import React from "react";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";

jest.mock("../../app/lib/realtime-session-factory", () => ({
  createRealtimeSession: jest.fn(() => ({
    session: {
      connect: jest.fn(),
      close: jest.fn(),
      mute: jest.fn(),
      sendMessage: jest.fn(),
      history: [],
      muted: false,
      on: jest.fn(),
      off: jest.fn(),
      getLatestAudioLevel: jest.fn(() => 0),
    },
    requiresToken: false,
  })),
}));

jest.mock("@openai/agents/realtime", () => {
  const tool = jest.fn().mockImplementation(
    ({
      name,
      description,
      parameters,
      execute,
    }: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      execute: (input: unknown) => Promise<unknown> | unknown;
    }) => {
      const invoke = jest.fn(async (input: unknown) => execute(input));
      return {
        type: "function",
        name,
        description,
        parameters,
        strict: true,
        invoke,
        execute,
        needsApproval: jest.fn(),
        isEnabled: jest.fn(),
      };
    },
  );
  return {
    tool,
    RealtimeAgent: jest.fn().mockImplementation(() => ({})),
    RealtimeSession: jest.fn(),
    OpenAIRealtimeWebRTC: jest.fn(),
  };
});

type MediaQueryListener = (event: MediaQueryListEvent) => void;

function createMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MediaQueryListener>();

  const mockMediaQuery: MediaQueryList = {
    matches,
    media: "(max-width: 768px)",
    onchange: null,
    addListener: (listener: MediaQueryListener) => {
      listeners.add(listener);
    },
    removeListener: (listener: MediaQueryListener) => {
      listeners.delete(listener);
    },
    addEventListener: (_: "change", listener: MediaQueryListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_: "change", listener: MediaQueryListener) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  } as MediaQueryList;

  const setMatches = (next: boolean) => {
    if (matches === next) {
      return;
    }
    matches = next;
    (mockMediaQuery as { matches: boolean }).matches = next;
    const event = { matches: next } as MediaQueryListEvent;
    listeners.forEach((listener) => listener(event));
  };

  return { mockMediaQuery, setMatches };
}

describe("ChatClient responsive layout", () => {
  let setMatches: (matches: boolean) => void;

  beforeEach(() => {
    const media = createMatchMedia(false);
    setMatches = media.setMatches;
    window.matchMedia = jest.fn(() => media.mockMediaQuery);
  });

  it("marks layout as wide by default", () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    const layout = document.querySelector("[data-layout]");
    expect(layout).toHaveAttribute("data-layout", "wide");
  });

  it("updates data-layout attribute when viewport becomes compact", async () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    await act(async () => {
      setMatches(true);
    });

    const layout = document.querySelector("[data-layout]");
    expect(layout).toHaveAttribute("data-layout", "compact");
  });
});
