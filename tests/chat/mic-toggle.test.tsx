import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

jest.mock("@openai/agents/realtime", () => {
  class MockSession {
    connect = jest.fn().mockResolvedValue(undefined);

    close = jest.fn();

    mute = jest.fn((muted: boolean) => {
      this.muted = muted;
    });

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

describe("ChatClient microphone toggle", () => {
  beforeEach(() => {
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
    global.fetch = originalFetch;
  });

  it("mutes and unmutes the session without reconnecting", async () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /connect to session/i }),
    );

    await waitFor(() => expect(sessionInstances.length).toBe(1));
    const session = sessionInstances[0];

    await waitFor(() => expect(session.connect).toHaveBeenCalledTimes(1));

    const muteButton = screen.getByRole("button", { name: /mute microphone/i });
    fireEvent.click(muteButton);

    expect(session.mute).toHaveBeenLastCalledWith(true);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /unmute microphone/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /unmute microphone/i }));

    expect(session.mute).toHaveBeenLastCalledWith(false);
    expect(session.connect).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
