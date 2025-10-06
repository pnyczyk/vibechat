import { render } from "@testing-library/react";
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
  }

  return {
    RealtimeAgent: jest.fn().mockImplementation(() => ({})),
    RealtimeSession: jest
      .fn()
      .mockImplementation(() => new MockRealtimeSession()),
  };
});

describe("ChatClient layout", () => {
  it("matches the minimalist canvas snapshot", () => {
    const { container } = render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
