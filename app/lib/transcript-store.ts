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

export class TranscriptStore {
  private entries: TranscriptEntry[] = [];

  private listeners = new Set<TranscriptListener>();

  private session: RealtimeSession | null = null;

  private unbindSession: (() => void) | null = null;

  private streamingText = new Map<string, string>();

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
    this.streamingText.clear();

    if (!session) {
      this.reset();
      return;
    }

    const updateFromHistory = () => {
      this.updateEntriesFromHistory(session);
    };

    const handleTransportEvent = (event: unknown) => {
      this.handleTransportEvent(session, event);
    };

    session.on("history_updated", updateFromHistory);
    session.on("history_added", updateFromHistory);
    session.on("transport_event", handleTransportEvent);

    this.unbindSession = () => {
      session.off("history_updated", updateFromHistory);
      session.off("history_added", updateFromHistory);
      session.off("transport_event", handleTransportEvent);
    };

    updateFromHistory();
  }

  reset(): void {
    if (this.entries.length === 0) {
      this.streamingText.clear();
      return;
    }

    this.entries = [];
    this.streamingText.clear();
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
    this.streamingText.clear();
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

    this.streamingText.clear();
  }

  private handleTransportEvent(
    session: RealtimeSession,
    event: unknown,
  ): void {
    if (!event || typeof event !== "object") {
      return;
    }

    const typed = event as {
      type?: string;
      itemId?: string;
      delta?: string;
    };

    if (typed.type !== "transcript_delta") {
      return;
    }

    if (typeof typed.itemId !== "string" || typeof typed.delta !== "string") {
      return;
    }

    if (!typed.delta) {
      return;
    }

    const existing = this.streamingText.get(typed.itemId) ?? this.getEntryText(typed.itemId);
    const next = `${existing ?? ""}${typed.delta}`;
    this.streamingText.set(typed.itemId, next);
    this.updateEntriesFromHistory(session);
  }

  private getEntryText(itemId: string): string {
    const existing = this.entries.find((entry) => entry.id === itemId);
    return existing?.text ?? "";
  }

  private updateEntriesFromHistory(session: RealtimeSession): void {
    const history = session.history;
    const nextEntries: TranscriptEntry[] = [];

    for (const item of history) {
      if (!isMessageItem(item) || !isConversationRole(item)) {
        continue;
      }

      const status =
        typeof (item as { status?: string }).status === "string"
          ? (item as { status?: string }).status
          : null;
      const baseText = extractTextFromContent(item);
      const override = this.streamingText.get(item.itemId);

      if (status === "completed" && override) {
        this.streamingText.delete(item.itemId);
      }

      const text = override && status !== "completed" ? override : baseText;

      if (!text) {
        continue;
      }

      nextEntries.push({
        id: item.itemId,
        role: item.role,
        text,
      });
    }

    this.setEntries(nextEntries);
  }

  private setEntries(entries: TranscriptEntry[]): void {
    const unchanged =
      entries.length === this.entries.length &&
      entries.every((entry, index) => {
        const current = this.entries[index];
        return (
          current &&
          current.id === entry.id &&
          current.role === entry.role &&
          current.text === entry.text
        );
      });

    if (unchanged) {
      return;
    }

    this.entries = entries;
    this.emit();
  }

}
