import { useEffect, useState } from "react";
import type { RealtimeSession } from "@openai/agents/realtime";

import type { TranscriptEntry, TranscriptStore } from "../transcript-store";

type UseTranscriptStoreOptions = {
  session: RealtimeSession | null;
  store: TranscriptStore;
};

/**
 * Binds a TranscriptStore to the current session and exposes live entries.
 * Keeps binding/unbinding concerns out of the main component tree.
 */
export function useTranscriptStore({
  session,
  store,
}: UseTranscriptStoreOptions): TranscriptEntry[] {
  const [entries, setEntries] = useState<TranscriptEntry[]>(store.getEntries());

  useEffect(() => {
    store.setSession(session);
    return () => {
      store.setSession(null);
    };
  }, [session, store]);

  useEffect(() => {
    const unsubscribe = store.subscribe((nextEntries) => {
      setEntries(nextEntries);
    });
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    return () => {
      store.dispose();
    };
  }, [store]);

  return entries;
}
