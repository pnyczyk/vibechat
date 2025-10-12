import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";

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
let nextConnectError: Error | null = null;

jest.mock("@openai/agents/realtime", () => {
  class MockSession {
    connect = jest.fn().mockImplementation(async () => {
      if (nextConnectError) {
        const error = nextConnectError;
        nextConnectError = null;
        throw error;
      }
    });

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

describe("ChatClient lightning entry overlay", () => {
  beforeEach(() => {
    sessionInstances.length = 0;
    nextConnectError = null;

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ value: "test-token" }),
    });

    // @ts-expect-error override fetch for test environment
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  it("shows the lightning overlay by default and hides it after connecting", async () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    const entryButton = screen.getByRole("button", { name: /start voice session/i });
    fireEvent.click(entryButton);

    await waitFor(() => expect(sessionInstances.length).toBe(1));
    const session = sessionInstances[0];
    await waitFor(() => expect(session.connect).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /start voice session/i }),
      ).not.toBeInTheDocument(),
    );

    expect(
      screen.getByRole("button", { name: /disconnect session/i }),
    ).toBeInTheDocument();
  });

  it("restores the overlay after disconnect", async () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    fireEvent.click(screen.getByRole("button", { name: /start voice session/i }));

    await waitFor(() => expect(sessionInstances.length).toBe(1));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /start voice session/i }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /disconnect session/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /start voice session/i }),
      ).toBeInTheDocument(),
    );
  });

  it("surfaces connection errors on the overlay", async () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    nextConnectError = new Error("forbidden");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start voice session/i }));
    });

    expect(fetchMock).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /start voice session/i }),
      ).toBeEnabled(),
    );

    await waitFor(() => expect(screen.queryAllByText(/forbidden/i).length).toBeGreaterThan(0));
  });
});
