import type {
  RealtimeAgent,
  RealtimeItem,
  RealtimeSessionConnectOptions,
  RealtimeUserInput,
} from "@openai/agents/realtime";

type Listener = (...args: any[]) => void;

type TextContent = Extract<
  RealtimeUserInput["content"][number],
  { type: "input_text" | "output_text"; text: string }
>;

function isTextContent(part: RealtimeUserInput["content"][number]): part is TextContent {
  return (
    (part.type === "input_text" || part.type === "output_text") &&
    typeof part.text === "string"
  );
}

let idCounter = 0;
function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function createMessageItem(
  itemId: string,
  role: "user" | "assistant",
  text: string,
): RealtimeItem {
  return {
    type: "message",
    role,
    itemId,
    status: "completed",
    content: [
      {
        type: role === "user" ? "input_text" : "output_text",
        text,
      },
    ],
  } as RealtimeItem;
}

export class MockRealtimeSession {
  history: RealtimeItem[] = [];

  muted: boolean | null = false;

  private listeners = new Map<string, Set<Listener>>();

  private closed = false;

  private level = 0.35;

  constructor(private _agent: RealtimeAgent) {}

  on(event: string, listener: Listener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  async connect(_options: RealtimeSessionConnectOptions): Promise<void> {
    if (this.closed) {
      throw new Error("Session closed");
    }
    this.emit("history_updated", this.history);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.emit("transport_event", {
      type: "session.closed",
    });
  }

  mute(nextMuted: boolean): void {
    this.muted = nextMuted;
    this.level = nextMuted ? 0 : 0.35;
  }

  getLatestAudioLevel(): number {
    return this.level;
  }

  sendMessage(message: RealtimeUserInput): void {
    if (this.closed) {
      throw new Error("Session closed");
    }

    const text = message.content
      .filter(isTextContent)
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join(" ");

    if (!text) {
      return;
    }

    const userId = createId("user");
    const userItem = createMessageItem(userId, "user", text);
    this.history = [...this.history, userItem];
    this.emitHistory();

    const responseId = createId("assistant");
    const replyText = `Odpowiedź na: ${text}`;
    const assistantItem = createMessageItem(responseId, "assistant", replyText);
    this.history = [...this.history, assistantItem];
    this.emitHistory();

    this.emit("transport_event", {
      type: "response.output_audio_transcript.delta",
      itemId: responseId,
      delta: replyText,
    });
  }

  addImage(): void {}

  updateHistory(): void {}

  sendAudio(): void {}

  interrupt(): void {}

  private emitHistory(): void {
    this.emit("history_added", this.history);
    this.emit("history_updated", this.history);
  }

  private emit(event: string, ...args: unknown[]): void {
    const listeners = this.listeners.get(event);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(...args);
    }
  }
}

export type { MockRealtimeSession as MockRealtimeSessionType };
