import { render, screen } from "@testing-library/react";
import React from "react";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";

jest.mock("@openai/agents/realtime", () => {
  class MockRealtimeSession {
    connect = jest.fn();
    close = jest.fn();
    mute = jest.fn();
    history: unknown[] = [];
    on = jest.fn();
    off = jest.fn();
    getLatestAudioLevel = jest.fn().mockReturnValue(null);
  }

  return {
    RealtimeAgent: jest.fn().mockImplementation(() => ({})),
    RealtimeSession: jest
      .fn()
      .mockImplementation(() => new MockRealtimeSession()),
    OpenAIRealtimeWebRTC: jest.fn().mockImplementation(() => ({})),
  };
});

describe("ChatClient layout", () => {
  it("renders control rail and voice activity indicator", () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    expect(screen.getByRole("heading", { name: /vibechat/i })).toBeInTheDocument();
    const indicator = screen.getByTestId("voice-activity-indicator");
    expect(indicator).toHaveAttribute("aria-label", expect.stringMatching(/waiting for audio/i));
    expect(screen.getByTestId("session-controls")).toContainElement(indicator);
  });
});
