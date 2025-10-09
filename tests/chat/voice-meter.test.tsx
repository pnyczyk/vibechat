import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EventEmitter } from "events";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";

type MockRealtimeSession = EventEmitter & {
  connect: jest.Mock<Promise<void>, []>;
  close: jest.Mock<void, []>;
  mute: jest.Mock<void, [boolean]>;
  muted: boolean;
  getLatestAudioLevel?: jest.Mock<number | null | undefined, []>;
  history: unknown[];
};

const sessionInstances: MockRealtimeSession[] = [];
const originalFetch = global.fetch;

jest.mock("@openai/agents/realtime", () => {
  class MockSession extends EventEmitter {
    connect = jest.fn().mockResolvedValue(undefined);

    close = jest.fn();

    mute = jest.fn((nextMuted: boolean) => {
      this.muted = nextMuted;
    });

    muted = false;

    history: unknown[] = [];
  }

  return {
    RealtimeAgent: jest.fn().mockImplementation(() => ({})),
    RealtimeSession: jest.fn().mockImplementation(() => {
      const instance = new MockSession() as MockRealtimeSession;
      sessionInstances.push(instance);
      return instance;
    }),
    OpenAIRealtimeWebRTC: jest.fn().mockImplementation((options?: { audioElement?: HTMLAudioElement }) => ({
      options,
    })),
  };
});

const fetchMock = jest.fn();

describe("ChatClient voice meter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sessionInstances.length = 0;

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ value: "test-token" }),
    });

    // @ts-expect-error override fetch for test environment
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.clearAllMocks();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it("reflects realtime playback levels", async () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect to session/i }));

    await waitFor(() => expect(sessionInstances.length).toBe(1));
    const session = sessionInstances[0];

    await waitFor(() => expect(session.connect).toHaveBeenCalledTimes(1));

    let latestLevel: number | null | undefined = null;
    session.getLatestAudioLevel = jest.fn(() => latestLevel);

    const indicator = await screen.findByTestId("voice-activity-indicator");
    expect(indicator).toHaveAttribute("aria-label", expect.stringMatching(/waiting for audio/i));

    await act(async () => {
      latestLevel = 0.7;
      jest.advanceTimersByTime(240);
    });

    await waitFor(() =>
      expect(indicator).toHaveAttribute("aria-label", expect.stringMatching(/speaking/i)),
    );
    expect(indicator).not.toHaveAttribute("aria-label", expect.stringMatching(/waiting for audio/i));

    await act(async () => {
      latestLevel = null;
      jest.advanceTimersByTime(900);
    });

    await waitFor(() =>
      expect(indicator).toHaveAttribute("aria-label", expect.stringMatching(/idle/i)),
    );
  });
});
