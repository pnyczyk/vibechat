import { EventEmitter } from "node:events";
import type { RealtimeItem, RealtimeSession } from "@openai/agents/realtime";
import { TranscriptStore } from "../../app/lib/transcript-store";

type MessageItem = Extract<RealtimeItem, { type: "message" }>;

class MockRealtimeSession
  extends EventEmitter
  implements Pick<RealtimeSession, "history" | "sendMessage">
{
  history: RealtimeItem[] = [];

  sendMessage = jest.fn();

  setHistory(items: RealtimeItem[]): void {
    this.history = items;
    this.emit("history_updated", items);
  }

  addMessage(item: RealtimeItem): void {
    this.history = [...this.history, item];
    this.emit("history_added", item);
  }
}

function createUserMessage(
  id: string,
  text: string,
  overrides: Partial<MessageItem> = {},
): MessageItem {
  return {
    itemId: id,
    type: "message",
    role: "user",
    status: "completed",
    content: [
      {
        type: "input_text",
        text,
      },
    ],
    ...overrides,
  } as MessageItem;
}

function createAssistantMessage(
  id: string,
  text: string,
  overrides: Partial<MessageItem> = {},
): MessageItem {
  return {
    itemId: id,
    type: "message",
    role: "assistant",
    status: "completed",
    content: [
      {
        type: "output_text",
        text,
      },
    ],
    ...overrides,
  } as MessageItem;
}

describe("TranscriptStore", () => {
  it("records entries in chronological order", () => {
    const session = new MockRealtimeSession();
    const store = new TranscriptStore();

    store.setSession(session as unknown as RealtimeSession);

    session.setHistory([
      createUserMessage("1", "Hello"),
      createAssistantMessage("2", "Hi there"),
    ]);

    expect(store.getEntries()).toEqual([
      { id: "1", role: "user", text: "Hello" },
      { id: "2", role: "assistant", text: "Hi there" },
    ]);
  });

  it("sends text messages through the session and waits for confirmation", () => {
    const session = new MockRealtimeSession();
    const store = new TranscriptStore();

    store.setSession(session as unknown as RealtimeSession);

    store.sendTextMessage("  Hello world  ");

    expect(session.sendMessage).toHaveBeenCalledWith({
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Hello world",
        },
      ],
    });
    expect(store.getEntries()).toEqual([]);

    session.addMessage(createUserMessage("1", "Hello world"));

    expect(store.getEntries()).toEqual([
      { id: "1", role: "user", text: "Hello world" },
    ]);
  });

  it("ignores empty submissions and resets when session detaches", () => {
    const session = new MockRealtimeSession();
    const store = new TranscriptStore();

    store.setSession(session as unknown as RealtimeSession);

    store.sendTextMessage("   ");

    expect(session.sendMessage).not.toHaveBeenCalled();

    session.setHistory([createAssistantMessage("1", "Welcome!")]);

    expect(store.getEntries()).toHaveLength(1);

    store.setSession(null);

    expect(store.getEntries()).toEqual([]);

    session.addMessage(createUserMessage("2", "Should be ignored"));

    expect(store.getEntries()).toEqual([]);
  });

  it("throws when sending without an active session", () => {
    const store = new TranscriptStore();

    expect(() => store.sendTextMessage("Hello")).toThrow(
      /active session/i,
    );
  });

  it("streams assistant entries as deltas arrive", () => {
    const session = new MockRealtimeSession();
    const store = new TranscriptStore();

    store.setSession(session as unknown as RealtimeSession);

    const streamingChunk = createAssistantMessage("a-1", "", {
      status: "in_progress" as MessageItem["status"],
    });

    session.setHistory([streamingChunk]);

    expect(store.getEntries()).toEqual([]);

    session.emit("transport_event", {
      type: "transcript_delta",
      itemId: "a-1",
      delta: "Typing",
    });

    expect(store.getEntries()).toEqual([
      { id: "a-1", role: "assistant", text: "Typing" },
    ]);

    session.emit("transport_event", {
      type: "transcript_delta",
      itemId: "a-1",
      delta: " response",
    });

    expect(store.getEntries()).toEqual([
      { id: "a-1", role: "assistant", text: "Typing response" },
    ]);

    const completed = createAssistantMessage("a-1", "Typing response done");
    session.setHistory([completed]);

    expect(store.getEntries()).toEqual([
      { id: "a-1", role: "assistant", text: "Typing response done" },
    ]);

    session.emit("transport_event", {
      type: "transcript_delta",
      itemId: "a-1",
      delta: " extra",
    });

    expect(store.getEntries()).toEqual([
      { id: "a-1", role: "assistant", text: "Typing response done" },
    ]);
  });
});
