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

  private streamingRole = new Map<string, TranscriptRole>();

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
    this.streamingRole.clear();

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
      this.streamingRole.clear();
      return;
    }

    this.entries = [];
    this.streamingText.clear();
    this.streamingRole.clear();
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
    this.streamingRole.clear();
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
    this.streamingRole.clear();
  }

  private handleTransportEvent(
    session: RealtimeSession,
    event: unknown,
  ): void {
    if (!event || typeof event !== "object") {
      return;
    }

    const typed = event as Record<string, unknown> & {
      type?: string;
    };

    const type = typeof typed.type === "string" ? typed.type : "";
    const isDeltaEvent =
      type === "transcript_delta" ||
      type === "response.output_audio_transcript.delta" ||
      type === "response.output_text.delta";

    if (!isDeltaEvent) {
      return;
    }

    const rawItemId =
      typeof typed.itemId === "string"
        ? typed.itemId
        : typeof (typed as { item_id?: unknown }).item_id === "string"
          ? ((typed as { item_id: string }).item_id)
          : undefined;

    const deltaValue = typeof (typed as { delta?: unknown }).delta === "string"
      ? (typed as { delta: string }).delta
      : undefined;

    if (!rawItemId || !deltaValue) {
      return;
    }

    this.ensureStreamingRole(rawItemId, session.history);

    const isTestEnv =
      typeof process !== "undefined" && process.env.NODE_ENV === "test";

    this.debugLog("delta", {
      eventType: type,
      itemId: rawItemId,
      delta: deltaValue,
    });

    const existing = this.streamingText.get(rawItemId) ?? this.getEntryText(rawItemId);
    const next = `${existing ?? ""}${deltaValue}`;
    this.streamingText.set(rawItemId, next);
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

      this.streamingRole.set(item.itemId, item.role);

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

    this.appendStreamingFallback(nextEntries);
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

    this.debugLog("update", {
      entries: entries.map((entry) => ({
        id: entry.id,
        role: entry.role,
        text: entry.text.slice(0, 80),
      })),
    });
  }

  private appendStreamingFallback(entries: TranscriptEntry[]): void {
    if (this.streamingText.size === 0) {
      return;
    }

    for (const [itemId, text] of this.streamingText) {
      if (!text) {
        continue;
      }

      const exists = entries.some((entry) => entry.id === itemId);
      if (exists) {
        continue;
      }

      const role =
        this.streamingRole.get(itemId) ?? this.findEntryRole(itemId) ?? "assistant";

    entries.push({
      id: itemId,
      role,
      text,
    });
  }

  }

  private findEntryRole(itemId: string): TranscriptRole | null {
    const existing = this.entries.find((entry) => entry.id === itemId);
    return existing?.role ?? null;
  }

  private ensureStreamingRole(itemId: string, history: RealtimeItem[]): void {
    if (this.streamingRole.has(itemId)) {
      return;
    }

    const historyItem = history.find(
      (entry): entry is Extract<RealtimeItem, { type: "message"; role: TranscriptRole }> =>
        isMessageItem(entry) && isConversationRole(entry) && entry.itemId === itemId,
    );

    if (historyItem) {
      this.streamingRole.set(itemId, historyItem.role);
      return;
    }

    const existing = this.entries.find((entry) => entry.id === itemId);
    if (existing) {
      this.streamingRole.set(itemId, existing.role);
    }
  }

  private debugLog(event: "delta" | "update", payload: Record<string, unknown>): void {
    if (!this.shouldLogDebug()) {
      return;
    }

    const timestamp = new Date().toISOString();
    console.debug(`[${timestamp}] TranscriptStore:${event}`, payload);
  }

  private shouldLogDebug(): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    const isTestEnv =
      typeof process !== "undefined" && process.env.NODE_ENV === "test";
    if (isTestEnv) {
      return false;
    }

    return true;
  }
}
