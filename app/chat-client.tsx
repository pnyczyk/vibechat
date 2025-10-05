'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

import type { RealtimeSessionEventTypes } from '@openai/agents/realtime';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

type EventName = keyof RealtimeSessionEventTypes;

const OBSERVED_EVENTS: EventName[] = [
  'agent_start',
  'agent_end',
  'agent_handoff',
  'agent_tool_start',
  'agent_tool_end',
  'transport_event',
  'audio_start',
  'audio',
  'audio_stopped',
  'audio_interrupted',
  'guardrail_tripped',
  'history_updated',
  'history_added',
  'error',
  'tool_approval_requested',
  'mcp_tool_call_completed',
  'mcp_tools_changed',
];

function formatKeyPreview(key: string) {
  if (key.length <= 10) {
    return key;
  }
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function ChatClient() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<RealtimeSession | null>(null);

  useEffect(() => {
    if (!session) {
      return undefined;
    }

    const emitter = session as unknown as {
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      off?: (event: string, handler: (...args: unknown[]) => void) => void;
    };

    const detachFns = OBSERVED_EVENTS.map((event) => {
      const handler = (...args: unknown[]) => {
        const logger = event === 'error' ? console.error : event.startsWith('audio') ? console.debug : console.log;
        logger(`[Realtime][${event}]`, ...args);
      };
      emitter.on(event, handler);
      return () => emitter.off?.(event, handler);
    });

    console.log('[Realtime] event listeners attached');

    return () => {
      detachFns.forEach((detach) => detach?.());
      console.log('[Realtime] event listeners detached, closing session');
      session.close();
    };
  }, [session]);

  useEffect(() => {
    console.log('[Realtime] status changed ->', status);
  }, [status]);

  useEffect(() => {
    if (error) {
      console.warn('[Realtime] error state ->', error);
    }
  }, [error]);

  const agent = useMemo(() => {
    console.log('[Realtime] constructing agent instance');
    return new RealtimeAgent({
      name: 'Assistant',
      instructions: 'Mów po polsku i odpowiadaj głosem. Bądź serdeczny.',
    });
  }, []);

  const handleConnect = useCallback(async () => {
    if (status === 'connecting' || status === 'connected') {
      console.log('[Realtime] connect requested while already active, ignoring');
      return;
    }

    if (session) {
      console.log('[Realtime] closing previous session before reconnect');
      session.close();
      setSession(null);
    }

    setError(null);
    setStatus('connecting');

    try {
      console.log('[Realtime] requesting realtime token…');
      const response = await fetch('/api/realtime-token');
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message =
          typeof body.error === 'string'
            ? body.error
            : `Token endpoint returned ${response.status}`;
        throw new Error(message);
      }

      const secret = await response.json();
      console.log('[Realtime] token payload received', secret);

      const apiKey = typeof secret?.value === 'string' ? secret.value : secret?.client_secret?.value;
      if (!apiKey) {
        throw new Error('Realtime token response missing value');
      }

      console.log('[Realtime] using ephemeral key', formatKeyPreview(apiKey));

      const newSession = new RealtimeSession(agent, {
        model: 'gpt-4o-realtime-preview-2025-06-03',
        config: {
          turnDetection: { type: 'semantic_vad', createResponse: true },
          modalities: ['text', 'audio'],
        },
      });

      console.log('[Realtime] created session, connecting…');
      await newSession.connect({ apiKey });
      console.log('[Realtime] session.connect resolved');
      setSession(newSession);
      setStatus('connected');
    } catch (err) {
      console.error('Failed to connect realtime session', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unexpected error');
    }
  }, [agent, session, status]);

  const handleDisconnect = useCallback(() => {
    if (!session) {
      console.log('[Realtime] disconnect requested without active session');
      return;
    }
    console.log('[Realtime] disconnecting session');
    session.close();
    setSession(null);
    setStatus('idle');
  }, [session]);

  return (
    <section
      style={{
        display: 'grid',
        gap: '1.5rem',
        padding: '2rem',
        borderRadius: '1rem',
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        backdropFilter: 'blur(6px)',
        maxWidth: '32rem',
        width: '100%',
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: '2rem' }}>VibeChat</h1>
        <p style={{ marginTop: '0.5rem', color: 'rgba(255, 255, 255, 0.75)' }}>
          Kliknij „Connect”, żeby nawiązać połączenie w czasie rzeczywistym z asystentem.
        </p>
      </header>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          type="button"
          onClick={handleConnect}
          disabled={status === 'connecting' || status === 'connected'}
          style={{ flex: '1 1 0' }}
        >
          {status === 'connecting' ? 'Connecting…' : status === 'connected' ? 'Connected' : 'Connect'}
        </button>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={status !== 'connected'}
          style={{ flex: '1 1 0' }}
        >
          Disconnect
        </button>
      </div>

      <footer style={{ fontSize: '0.95rem', color: 'rgba(255, 255, 255, 0.85)' }}>
        <p style={{ margin: 0 }}>Status: {status}</p>
        {error ? (
          <p style={{ margin: '0.5rem 0 0', color: '#ff9b9b' }}>Error: {error}</p>
        ) : (
          <p style={{ margin: '0.5rem 0 0', color: 'rgba(255, 255, 255, 0.65)' }}>
            Przyznaj uprawnienia do mikrofonu, gdy przeglądarka o to poprosi.
          </p>
        )}
      </footer>
    </section>
  );
}
