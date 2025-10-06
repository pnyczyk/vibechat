import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EventEmitter } from "events";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";

type MockRealtimeSession = EventEmitter & {
  connect: jest.Mock<Promise<void>, []>;
  close: jest.Mock<void, []>;
  mute: jest.Mock<void, [boolean]>;
  muted: boolean;
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
  }

  return {
    RealtimeAgent: jest.fn().mockImplementation(() => ({})),
    RealtimeSession: jest.fn().mockImplementation(() => {
      const instance = new MockSession() as MockRealtimeSession;
      sessionInstances.push(instance);
      return instance;
    }),
  };
});

const fetchMock = jest.fn();

describe("ChatClient voice meter", () => {
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

  it("maps session voice activity events to the UI", async () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect to session/i }));

    await waitFor(() => expect(sessionInstances.length).toBe(1));
    const session = sessionInstances[0];

    await waitFor(() => expect(session.connect).toHaveBeenCalledTimes(1));

    const voiceMeter = await screen.findByTestId("voice-meter");
    expect(voiceMeter).toHaveTextContent(/waiting for audio/i);
    expect(voiceMeter).toHaveTextContent(/inactive/i);

    await act(async () => {
      session.emit("voice-activity", { level: 0.8 });
    });

    await waitFor(() => expect(voiceMeter).toHaveTextContent(/speaking/i));
    expect(voiceMeter).not.toHaveTextContent(/waiting for audio/i);

    await act(async () => {
      session.emit("voice-activity", { active: false });
    });

    await waitFor(() => expect(voiceMeter).toHaveTextContent(/idle/i));
  });
});
