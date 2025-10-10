import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";
import type {
  TelemetryEventName,
  TelemetryEvents,
} from "../../app/lib/analytics";
import { logTelemetry } from "../../app/lib/analytics";
import { createRealtimeSession } from "../../app/lib/realtime-session-factory";

jest.mock("../../app/lib/analytics", () => ({
  logTelemetry: jest.fn(),
}));

jest.mock("../../app/lib/realtime-session-factory");

jest.mock("@openai/agents/realtime", () => {
  class MockRealtimeSession {
    connect = jest.fn().mockResolvedValue(undefined);
    close = jest.fn();
    mute = jest.fn();
    sendMessage = jest.fn();
    history: unknown[] = [];
    on = jest.fn();
    off = jest.fn();
    getLatestAudioLevel = jest.fn().mockReturnValue(0.4);
    muted: boolean | null = false;
  }

  return {
    RealtimeAgent: jest.fn().mockImplementation(() => ({})),
    RealtimeSession: jest
      .fn()
      .mockImplementation(() => new MockRealtimeSession()),
    OpenAIRealtimeWebRTC: jest.fn().mockImplementation(() => ({})),
  };
});

type MockedTelemetry = jest.MockedFunction<typeof logTelemetry>;

type MockedCreateRealtimeSession = jest.MockedFunction<typeof createRealtimeSession>;

const mockedTelemetry = logTelemetry as MockedTelemetry;
const mockedCreateSession = createRealtimeSession as MockedCreateRealtimeSession;

const originalFetch = global.fetch;

type SessionMock = {
  connect: jest.Mock<Promise<void>, []>;
  close: jest.Mock<void, []>;
  mute: jest.Mock<void, [boolean]>;
  sendMessage: jest.Mock<void, [unknown]>;
  history: unknown[];
  muted: boolean | null;
  on: jest.Mock<void, [string, (...args: unknown[]) => void]>;
  off: jest.Mock<void, [string, (...args: unknown[]) => void]>;
  getLatestAudioLevel: jest.Mock<number, []>;
};

function buildSessionMock(): SessionMock {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    mute: jest.fn(),
    sendMessage: jest.fn(),
    history: [],
    muted: false,
    on: jest.fn(),
    off: jest.fn(),
    getLatestAudioLevel: jest.fn().mockReturnValue(0.4),
  };
}

let activeSession: SessionMock;

beforeAll(() => {
  global.fetch = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
  activeSession = buildSessionMock();
  (global.fetch as jest.Mock).mockReset();

  mockedCreateSession.mockImplementation(() => ({
    session: activeSession,
    requiresToken: false,
  }));
});

afterAll(() => {
  global.fetch = originalFetch;
});

function renderClient() {
  render(
    <Providers>
      <ChatClient />
    </Providers>,
  );
}

function telemetryCalledWith<E extends TelemetryEventName>(
  event: E,
  matcher: Partial<TelemetryEvents[E]>,
) {
  expect(mockedTelemetry).toHaveBeenCalledWith(
    event,
    expect.objectContaining(matcher),
  );
}

describe("ChatClient telemetry", () => {
  it("emits events for successful connect flow", async () => {
    renderClient();

    const connectButton = screen.getByRole("button", { name: /connect to session/i });
    fireEvent.click(connectButton);

    await waitFor(() => expect(activeSession.connect).toHaveBeenCalledTimes(1));

    telemetryCalledWith("session_connect_attempt", { transport: "mock" });
    telemetryCalledWith("session_connect_success", {
      transport: "mock",
      durationMs: expect.any(Number),
    });
  });

  it("emits failure telemetry when connect fails", async () => {
    mockedCreateSession.mockImplementation(() => ({
      session: activeSession,
      requiresToken: true,
    }));

    const errorResponse = {
      ok: false,
      json: jest.fn().mockResolvedValue({ error: "forbidden" }),
    } as unknown as Response;
    (global.fetch as jest.Mock).mockResolvedValueOnce(errorResponse);

    renderClient();

    const connectButton = screen.getByRole("button", { name: /connect to session/i });
    await act(async () => {
      fireEvent.click(connectButton);
    });

    await waitFor(() =>
      expect(mockedTelemetry).toHaveBeenCalledWith(
        "session_connect_failure",
        expect.objectContaining({ message: expect.stringContaining("forbidden") }),
      ),
    );
    telemetryCalledWith("session_connect_attempt", { transport: "realtime" });
  });

  it("logs mute and transcript interactions", async () => {
    renderClient();

    const connectButton = screen.getByRole("button", { name: /connect to session/i });
    fireEvent.click(connectButton);
    await waitFor(() => expect(activeSession.connect).toHaveBeenCalledTimes(1));

    const muteButton = screen.getByRole("button", { name: /mute microphone/i });
    fireEvent.click(muteButton);
    telemetryCalledWith("session_mute_enabled", {});

    const unmuteButton = screen.getByRole("button", { name: /unmute microphone/i });
    fireEvent.click(unmuteButton);
    telemetryCalledWith("session_mute_disabled", {});

    const transcriptToggle = screen.getByTestId("transcript-toggle");
    fireEvent.click(transcriptToggle);
    telemetryCalledWith("transcript_opened", {});

    const input = await screen.findByLabelText(/send a message/i);
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    telemetryCalledWith("transcript_message_sent", { length: 5 });

    const closeButton = await screen.findByRole("button", { name: /close transcript/i });
    fireEvent.click(closeButton);
    telemetryCalledWith("transcript_closed", {});
  });

  it("logs disconnect telemetry", async () => {
    renderClient();

    const connectButton = screen.getByRole("button", { name: /connect to session/i });
    fireEvent.click(connectButton);
    await waitFor(() => expect(activeSession.connect).toHaveBeenCalledTimes(1));

    const disconnectButton = screen.getByRole("button", { name: /disconnect session/i });
    fireEvent.click(disconnectButton);

    telemetryCalledWith("session_disconnect", { reason: "user" });
  });
});
