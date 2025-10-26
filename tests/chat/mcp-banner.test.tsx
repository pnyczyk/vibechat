/** @jest-environment jsdom */

import { act, render, screen } from "@testing-library/react";

import { ChatClient } from "@/app/chat-client";
import Providers from "@/app/providers";

const adapterInstances: any[] = [];

jest.mock("@/app/lib/voice-agent/mcp-adapter", () => {
  const actual = jest.requireActual("@/app/lib/voice-agent/mcp-adapter");

  class MockAdapter {
    private listeners = new Set<(event: any) => void>();

    constructor() {
      adapterInstances.push(this);
    }

    subscribe(listener: (event: any) => void) {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }

    attach = jest.fn(async () => undefined);

    detach = jest.fn(() => undefined);

    emit(event: any) {
      this.listeners.forEach((listener) => listener(event));
    }
  }

  return {
    ...actual,
    McpAdapter: MockAdapter,
  };
});

describe("ChatClient MCP banner", () => {
  afterEach(() => {
    adapterInstances.splice(0, adapterInstances.length);
  });

  it("renders tool run updates", async () => {
    render(
      <Providers>
        <ChatClient />
      </Providers>,
    );

    expect(adapterInstances.length).toBeGreaterThan(0);
    const adapter = adapterInstances[0];

    await act(async () => {
      adapter.emit({
        type: "tools-changed",
        tools: [
          { id: "server-a:Summarize", name: "Summarize", serverId: "server-a", permissions: [] },
        ],
      });
      adapter.emit({
        type: "run-updated",
        run: {
          runId: "run-1",
          toolId: "server-a:Summarize",
          toolName: "Summarize",
          serverId: "server-a",
          status: "success",
          message: "Completed",
          startedAt: Date.now(),
          completedAt: Date.now(),
        },
      });
    });

    expect(screen.getByTestId("mcp-tool-runs")).toHaveTextContent("Summarize");
    expect(screen.getByTestId("mcp-tool-runs")).toHaveTextContent("Completed");
  });
});
