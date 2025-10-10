import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import React from "react";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";

expect.extend(toHaveNoViolations);

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

jest.mock("@openai/agents/realtime", () => ({
  RealtimeAgent: jest.fn().mockImplementation(() => ({})),
  RealtimeSession: jest.fn(),
}));

beforeAll(() => {
  if (typeof window !== "undefined" && !window.matchMedia) {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  }
});

describe("ChatClient accessibility", () => {
  it("has no axe violations on initial render", async () => {
    const { container } = render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    const results = await axe(container, {
      rules: {
        // jsdom lacks layout APIs needed for color-contrast checks
        "color-contrast": { enabled: false },
      },
    });

    expect(results).toHaveNoViolations();
  });
});
