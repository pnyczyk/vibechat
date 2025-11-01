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
    tool,
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

function createFetchResponse(
  overrides: Partial<Response & { json: jest.Mock; text: jest.Mock }> = {},
) {
  const defaultJson = jest.fn().mockResolvedValue({
    tools: [],
    collectedAt: Date.now(),
  });
  const defaultText = jest.fn().mockResolvedValue('');
  const defaultBody = {
    getReader: () => ({
      read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
    }),
  };
  return {
    ok: true,
    status: 200,
    json: defaultJson,
    text: defaultText,
    body: defaultBody as unknown as ReadableStream<Uint8Array>,
    ...overrides,
  } as Response;
}

beforeAll(() => {
  global.fetch = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
  activeSession = buildSessionMock();
  (global.fetch as jest.Mock).mockReset();
  (global.fetch as jest.Mock).mockImplementation(() =>
    Promise.resolve(createFetchResponse()),
  );

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
  const matchingCall = mockedTelemetry.mock.calls.find(
    ([name, payload]) =>
      name === event &&
      expect
        .objectContaining(matcher)
        .asymmetricMatch(payload as TelemetryEvents[E]),
  );

  expect(matchingCall).toBeDefined();
}

describe("ChatClient telemetry", () => {
  it("emits events for successful connect flow", async () => {
    renderClient();

    await waitFor(() =>
      telemetryCalledWith("session_entry_started", {
        startedAt: expect.any(String),
      }),
    );

    const connectButton = screen.getByRole("button", { name: /start voice session/i });
    fireEvent.click(connectButton);

    await waitFor(() => expect(activeSession.connect).toHaveBeenCalledTimes(1));

    telemetryCalledWith("session_connect_attempt", { transport: "mock" });
    telemetryCalledWith("session_connect_success", {
      transport: "mock",
      durationMs: expect.any(Number),
      entryLatencyMs: expect.any(Number),
    });

    await waitFor(() =>
      telemetryCalledWith("voice_activity_transition", {
        state: "active",
        hasMetrics: true,
      }),
    );
  });

  it("emits failure telemetry when connect fails", async () => {
    mockedCreateSession.mockImplementation(() => ({
      session: activeSession,
      requiresToken: true,
    }));

    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementationOnce(() => Promise.resolve(createFetchResponse()));
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        createFetchResponse({
          ok: false,
          status: 403,
          json: jest.fn().mockResolvedValue({ error: "forbidden" }),
          text: jest.fn().mockResolvedValue("forbidden"),
        }),
      ),
    );

    renderClient();

    const connectButton = screen.getByRole("button", { name: /start voice session/i });
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

    await waitFor(() =>
      telemetryCalledWith("session_entry_started", {
        startedAt: expect.any(String),
      }),
    );

    const connectButton = screen.getByRole("button", { name: /start voice session/i });
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

    const themeToggleDark = screen.getByRole("button", { name: /switch to dark mode/i });
    fireEvent.click(themeToggleDark);
    await waitFor(() =>
      telemetryCalledWith("session_theme_selected", {
        mode: "dark",
        source: "toggle",
      }),
    );

    const themeToggleLight = screen.getByRole("button", { name: /switch to light mode/i });
    fireEvent.click(themeToggleLight);
    telemetryCalledWith("session_theme_selected", {
      mode: "light",
      source: "toggle",
    });
  });

  it("logs disconnect telemetry", async () => {
    renderClient();

    await waitFor(() =>
      telemetryCalledWith("session_entry_started", {
        startedAt: expect.any(String),
      }),
    );

    const connectButton = screen.getByRole("button", { name: /start voice session/i });
    fireEvent.click(connectButton);
    await waitFor(() => expect(activeSession.connect).toHaveBeenCalledTimes(1));

    const disconnectButton = screen.getByRole("button", { name: /disconnect session/i });
    fireEvent.click(disconnectButton);

    telemetryCalledWith("session_disconnect", { reason: "user" });

    await waitFor(() =>
      telemetryCalledWith("voice_activity_transition", {
        state: "waiting",
        hasMetrics: false,
      }),
    );
  });
});
