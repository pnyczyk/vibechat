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

  private persistentEntries = new Map<string, TranscriptEntry>();

  private entryOrder: string[] = [];

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
    this.persistentEntries.clear();
    this.entryOrder = [];

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
      this.persistentEntries.clear();
      this.entryOrder = [];
      return;
    }

    this.entries = [];
    this.streamingText.clear();
    this.streamingRole.clear();
    this.persistentEntries.clear();
    this.entryOrder = [];
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
    this.persistentEntries.clear();
    this.entryOrder = [];
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
    this.persistentEntries.clear();
    this.entryOrder = [];
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
    this.ensureEntryOrder(rawItemId);

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
    const existing = this.persistentEntries.get(itemId);
    return existing?.text ?? "";
  }

  private updateEntriesFromHistory(session: RealtimeSession): void {
    const history = session.history;

    for (const item of history) {
      if (!isMessageItem(item) || !isConversationRole(item)) {
        continue;
      }

      this.ensureEntryOrder(item.itemId);
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

      const fallback = this.persistentEntries.get(item.itemId)?.text ?? "";
      const text = override && status !== "completed"
        ? override
        : baseText || fallback;

      if (!text) {
        continue;
      }

      this.upsertPersistentEntry(item.itemId, item.role, text);
    }

    this.appendStreamingFallback();
    this.emitEntries();
  }

  private appendStreamingFallback(): void {
    if (this.streamingText.size === 0) {
      return;
    }

    for (const [itemId, text] of this.streamingText) {
      if (!text) {
        continue;
      }

      const role =
        this.streamingRole.get(itemId) ||
        this.persistentEntries.get(itemId)?.role ||
        "assistant";

      this.ensureEntryOrder(itemId);
      this.upsertPersistentEntry(itemId, role, text);
    }
  }

  private upsertPersistentEntry(
    itemId: string,
    role: TranscriptRole,
    text: string,
  ): void {
    this.persistentEntries.set(itemId, { id: itemId, role, text });
  }

  private emitEntries(): void {
    const nextEntries: TranscriptEntry[] = [];

    for (const itemId of this.entryOrder) {
      const entry = this.persistentEntries.get(itemId);
      if (!entry || !entry.text) {
        continue;
      }
      nextEntries.push(entry);
    }

    const unchanged =
      nextEntries.length === this.entries.length &&
      nextEntries.every((entry, index) => {
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

    this.entries = nextEntries;
    this.emit();

    this.debugLog("update", {
      entries: nextEntries.map((entry) => ({
        id: entry.id,
        role: entry.role,
        text: entry.text.slice(0, 80),
      })),
    });
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

    const existing = this.persistentEntries.get(itemId);
    if (existing) {
      this.streamingRole.set(itemId, existing.role);
    }
  }

  private ensureEntryOrder(itemId: string): void {
    if (!this.entryOrder.includes(itemId)) {
      this.entryOrder.push(itemId);
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
