import {
  OpenAIRealtimeWebRTC,
  RealtimeAgent,
  RealtimeSession,
} from "@openai/agents/realtime";

import { MockRealtimeSession, type MockRealtimeSessionType } from "./mock-realtime-session";

const useMockRuntime = process.env.NEXT_PUBLIC_USE_REALTIMEMOCK === "1";

type CreateSessionResult = {
  session: RealtimeSession;
  requiresToken: boolean;
};

export function createRealtimeSession(
  agent: RealtimeAgent,
  audioElement: HTMLAudioElement | null,
): CreateSessionResult {
  if (useMockRuntime) {
    const mockSession = new MockRealtimeSession(agent);

    if (typeof window !== "undefined") {
      const globalWindow = window as typeof window & {
        __vibeMockSession?: MockRealtimeSessionType;
      };
      globalWindow.__vibeMockSession = mockSession;
    }

    return {
      session: mockSession as unknown as RealtimeSession,
      requiresToken: false,
    };
  }

  const transport =
    audioElement && typeof window !== "undefined"
      ? new OpenAIRealtimeWebRTC({ audioElement })
      : undefined;

  const session = new RealtimeSession(agent, {
    model: "gpt-realtime",
    ...(transport ? { transport } : {}),
  });

  return {
    session,
    requiresToken: true,
  };
}
