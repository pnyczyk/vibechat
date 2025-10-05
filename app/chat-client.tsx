'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export function ChatClient() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<RealtimeSession | null>(null);

  useEffect(() => {
    return () => {
      session?.close();
    };
  }, [session]);

  const agent = useMemo(() => {
    return new RealtimeAgent({
      name: 'Assistant',
      instructions: 'Mów po polsku i odpowiadaj głosem. Bądź serdeczny.',
    });
  }, []);

  const handleConnect = useCallback(async () => {
    if (status === 'connecting' || status === 'connected') {
      return;
    }

    if (session) {
      session.close();
      setSession(null);
    }

    setError(null);
    setStatus('connecting');

    try {
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
      const apiKey = typeof secret?.value === 'string' ? secret.value : secret?.client_secret?.value;
      if (!apiKey) {
        throw new Error('Realtime token response missing value');
      }

      const newSession = new RealtimeSession(agent, {
        model: 'gpt-realtime',
      });

      await newSession.connect({ apiKey });
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
      return;
    }
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
