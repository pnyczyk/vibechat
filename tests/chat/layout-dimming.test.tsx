import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";
import HomePage from "../../app/page";

type MockRealtimeSession = {
  connect: jest.Mock<Promise<void>, []>;
  close: jest.Mock<void, []>;
  mute: jest.Mock<void, [boolean]>;
  muted: boolean;
  history: unknown[];
  on: jest.Mock;
  off: jest.Mock;
  getLatestAudioLevel: jest.Mock<number | null, []>;
};

const sessionInstances: MockRealtimeSession[] = [];
const originalFetch = global.fetch;

jest.mock("@openai/agents/realtime", () => {
  class MockSession {
    connect = jest.fn().mockResolvedValue(undefined);

    close = jest.fn();

    mute = jest.fn();

    muted = false;

    history: unknown[] = [];

    on = jest.fn();

    off = jest.fn();

    getLatestAudioLevel = jest.fn().mockReturnValue(null);
  }

  return {
    RealtimeAgent: jest.fn().mockImplementation(() => ({})),
    RealtimeSession: jest.fn().mockImplementation(() => {
      const instance = new MockSession() as MockRealtimeSession;
      sessionInstances.push(instance);
      return instance;
    }),
    OpenAIRealtimeWebRTC: jest
      .fn()
      .mockImplementation((options?: { audioElement?: HTMLAudioElement }) => ({
        options,
      })),
  };
});

const fetchMock = jest.fn();

function ensureMatchMedia() {
  if (typeof window === "undefined") {
    return;
  }

  const matchMediaImplementation = (query: string): MediaQueryList => ({
    matches: query.includes("max-width") ? false : false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation(matchMediaImplementation),
  });
}

describe("UI streamlining viewport and dimming behaviour", () => {
  beforeEach(() => {
    sessionInstances.length = 0;

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ value: "test-token" }),
    });

    // @ts-expect-error override fetch for test environment
    global.fetch = fetchMock;

    ensureMatchMedia();
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  it("marks the root canvas as full-viewport", () => {
    const { container } = render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    const main = container.querySelector("main");
    expect(main).toHaveAttribute("data-viewport", "full");

    const layout = container.querySelector("[data-dimmed]");
    expect(layout).toHaveAttribute("data-dimmed", "true");
  });

  it("toggles dimming only when the session is disconnected", async () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    const layout = document.querySelector("[data-dimmed]");
    expect(layout).toHaveAttribute("data-dimmed", "true");

    fireEvent.click(screen.getByRole("button", { name: /start voice session/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /disconnect session/i })).toBeInTheDocument(),
    );

    expect(layout).toHaveAttribute("data-dimmed", "false");

    fireEvent.click(screen.getByRole("button", { name: /disconnect session/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /start voice session/i })).toBeInTheDocument(),
    );

    expect(layout).toHaveAttribute("data-dimmed", "true");
  });
});
