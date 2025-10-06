import type { RealtimeItem, RealtimeSession } from "@openai/agents/realtime";

type TranscriptRole = "user" | "assistant";

export type TranscriptEntry = {
  id: string;
  role: TranscriptRole;
  text: string;
};

type TranscriptListener = (entries: TranscriptEntry[]) => void;

function isMessageItem(
  item: RealtimeItem,
): item is Extract<RealtimeItem, { type: "message" }> {
  return item.type === "message";
}

function isConversationRole(
  item: Extract<RealtimeItem, { type: "message" }>,
): item is Extract<RealtimeItem, { type: "message"; role: TranscriptRole }> {
  return item.role === "user" || item.role === "assistant";
}

function isFinalStatus(status: string | undefined): boolean {
  return status === "completed" || status === "incomplete";
}

function extractTextFromContent(
  item: Extract<RealtimeItem, { type: "message"; role: TranscriptRole }>,
): string {
  return item.content
    .map((part) => {
      if (part.type === "input_text" || part.type === "output_text") {
        return part.text;
      }

      if (part.type === "input_audio" || part.type === "output_audio") {
        return part.transcript ?? "";
      }

      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildTranscriptEntries(history: RealtimeItem[]): TranscriptEntry[] {
  return history
    .filter(isMessageItem)
    .filter(isConversationRole)
    .filter((item) =>
      "status" in item ? isFinalStatus(item.status) : true,
    )
    .map((item) => ({
      id: item.itemId,
      role: item.role,
      text: extractTextFromContent(item),
    }))
    .filter((entry) => entry.text.length > 0);
}

export class TranscriptStore {
  private entries: TranscriptEntry[] = [];

  private listeners = new Set<TranscriptListener>();

  private session: RealtimeSession | null = null;

  private unbindSession: (() => void) | null = null;

  getEntries(): TranscriptEntry[] {
    return this.entries;
  }

  subscribe(listener: TranscriptListener): () => void {
    this.listeners.add(listener);
    listener(this.entries);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setSession(session: RealtimeSession | null): void {
    if (this.session === session) {
      return;
    }

    this.teardownSessionBinding();

    this.session = session;

    if (!session) {
      this.reset();
      return;
    }

    const updateFromHistory = () => {
      this.entries = buildTranscriptEntries(session.history);
      this.emit();
    };

    session.on("history_updated", updateFromHistory);
    session.on("history_added", updateFromHistory);

    this.unbindSession = () => {
      session.off("history_updated", updateFromHistory);
      session.off("history_added", updateFromHistory);
    };

    updateFromHistory();
  }

  reset(): void {
    if (this.entries.length === 0) {
      return;
    }

    this.entries = [];
    this.emit();
  }

  sendTextMessage(text: string): void {
    const session = this.session;

    if (!session) {
      throw new Error("Cannot send message without an active session");
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    session.sendMessage({
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: trimmed,
        },
      ],
    });
  }

  dispose(): void {
    this.teardownSessionBinding();
    this.listeners.clear();
    this.entries = [];
    this.session = null;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.entries);
    }
  }

  private teardownSessionBinding(): void {
    if (this.unbindSession) {
      this.unbindSession();
      this.unbindSession = null;
    }
  }
}
