import { render, screen, fireEvent } from "@testing-library/react";
import Providers from "../../app/providers";
import { ChatClient } from "../../app/chat-client";
import { __storage } from "../../app/lib/theme-store";

const originalFetch = global.fetch;

jest.mock("@openai/agents/realtime", () => {
  class MockSession {
    connect = jest.fn().mockResolvedValue(undefined);

    close = jest.fn();

    mute = jest.fn();

    muted = false;

    history: unknown[] = [];
  }

  return {
    RealtimeAgent: jest.fn().mockImplementation(() => ({})),
    RealtimeSession: jest.fn().mockImplementation(() => new MockSession()),
    OpenAIRealtimeWebRTC: jest.fn().mockImplementation(() => ({})),
  };
});

describe("ChatClient theme toggle", () => {
  beforeEach(() => {
    window.localStorage?.clear();
    // @ts-expect-error override fetch for test environment
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.localStorage?.clear();
    global.fetch = originalFetch;
  });

  it("toggles between light and dark modes", () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    const toggle = screen.getByRole("button", { name: /switch to dark mode/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toBeEnabled();

    const initialBackground = window.getComputedStyle(document.body).backgroundColor;

    fireEvent.click(toggle);

    const toggled = screen.getByRole("button", { name: /switch to light mode/i });
    expect(toggled).toHaveAttribute("aria-pressed", "true");
    const darkBackground = window.getComputedStyle(document.body).backgroundColor;
    expect(darkBackground).not.toEqual(initialBackground);
  });

  it("persists the selected theme across reloads", () => {
    const { unmount } = render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    const toggle = screen.getByRole("button", { name: /switch to dark mode/i });
    fireEvent.click(toggle);

    expect(window.localStorage?.getItem(__storage.key)).toBe("dark");
    const darkBackground = window.getComputedStyle(document.body).backgroundColor;

    unmount();

    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    const restored = screen.getByRole("button", { name: /switch to light mode/i });
    expect(restored).toHaveAttribute("aria-pressed", "true");
    const restoredBackground = window.getComputedStyle(document.body).backgroundColor;
    expect(restoredBackground).toEqual(darkBackground);
  });

  it("leaves dimmed entry state unaffected by theme toggling", () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    const layout = screen.getByTestId("chat-layout");
    expect(layout).toHaveAttribute("data-dimmed", "true");

    const toggle = screen.getByRole("button", { name: /switch to dark mode/i });
    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeEnabled();
    expect(layout).toHaveAttribute("data-dimmed", "true");
    expect(
      screen.getByRole("button", { name: /start voice session/i }),
    ).toBeInTheDocument();
  });
});
