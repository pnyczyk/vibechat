'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import styles from './chat-client.module.css';

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
    <section className={styles.layout} aria-labelledby="chat-title">
      <div className={styles.canvas}>
        <header className={styles.header}>
          <Typography id="chat-title" variant="h3" component="h1" className={styles.title}>
            VibeChat
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Connect to start a realtime voice session or explore the workspace while we prepare new
            modules.
          </Typography>
        </header>

        <div className={styles.surface} role="presentation">
          <Typography variant="body2" color="text.secondary">
            Voice interaction canvas reserved for upcoming live session visualization.
          </Typography>
        </div>

        <footer className={styles.status} aria-live="polite">
          <Typography variant="body2">Status: {status}</Typography>
          {error ? (
            <Typography variant="body2" color="error">
              Error: {error}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Allow microphone access when prompted to keep the session ready.
            </Typography>
          )}
        </footer>
      </div>

      <aside className={styles.controlRail} aria-label="Session controls">
        <div className={styles.controlRailInner}>
          <Typography component="h2" variant="subtitle2" className={styles.controlHeading}>
            Controls
          </Typography>
          <div className={styles.controlStack}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleConnect}
              disabled={status === 'connecting' || status === 'connected'}
              fullWidth
            >
              {status === 'connecting' ? 'Connecting…' : status === 'connected' ? 'Connected' : 'Connect'}
            </Button>
            <Button
              variant="outlined"
              color="primary"
              onClick={handleDisconnect}
              disabled={status !== 'connected'}
              fullWidth
            >
              Disconnect
            </Button>
          </div>
        </div>
      </aside>
    </section>
  );
}
