export type TelemetryTransport = "mock" | "realtime";

type ThemePreference = "light" | "dark";

export type TelemetryEvents = {
  session_connect_attempt: { transport: TelemetryTransport };
  session_connect_success: {
    durationMs: number;
    transport: TelemetryTransport;
    entryLatencyMs?: number | null;
  };
  session_connect_failure: { message: string; transport: TelemetryTransport };
  session_disconnect: { reason: "user" | "error" };
  session_mute_enabled: Record<string, never>;
  session_mute_disabled: Record<string, never>;
  transcript_opened: Record<string, never>;
  transcript_closed: Record<string, never>;
  transcript_message_sent: { length: number };
  session_entry_started: { startedAt: string };
  session_theme_selected: { mode: ThemePreference; source: "toggle" | "explicit" };
  voice_activity_transition: {
    state: "waiting" | "idle" | "active";
    hasMetrics: boolean;
  };
};

export type TelemetryEventName = keyof TelemetryEvents;

export type TelemetryPayload<E extends TelemetryEventName> = TelemetryEvents[E];

export type TelemetryHandler = <E extends TelemetryEventName>(
  event: E,
  payload: TelemetryPayload<E> & { timestamp: string },
) => void;

const isTestEnv = typeof process !== "undefined" && process.env.NODE_ENV === "test";
const telemetryFlag =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_ENABLE_TELEMETRY === "1";
const telemetryEnabledByDefault = Boolean(telemetryFlag && !isTestEnv);

const defaultHandler: TelemetryHandler = (event, payload) => {
  if (!telemetryEnabledByDefault) {
    return;
  }

  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(
      new CustomEvent("vibechat:telemetry", {
        detail: { event, payload },
      }),
    );
    return;
  }

  if (typeof console !== "undefined" && typeof console.info === "function") {
    console.info("[telemetry]", event, payload);
  }
};

let handler: TelemetryHandler = defaultHandler;

function nowIsoString(): string {
  try {
    return new Date().toISOString();
  } catch (error) {
    return `${Date.now()}`;
  }
}

export function logTelemetry<E extends TelemetryEventName>(
  event: E,
  payload: TelemetryPayload<E>,
): void {
  const enrichedPayload = {
    ...payload,
    timestamp: nowIsoString(),
  } as TelemetryPayload<E> & { timestamp: string };

  if (!telemetryEnabledByDefault && handler === defaultHandler) {
    return;
  }

  try {
    handler(event, enrichedPayload);
  } catch (error) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("Telemetry handler failed", error);
    }
  }
}

export function setTelemetryHandlerForTesting(nextHandler: TelemetryHandler | null): void {
  handler = nextHandler ?? defaultHandler;
}

export function isTelemetryEnabled(): boolean {
  return telemetryEnabledByDefault || handler !== defaultHandler;
}
