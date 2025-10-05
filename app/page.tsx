import { ChatClient } from './chat-client';

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '3rem',
      }}
    >
      <ChatClient />
    </main>
  );
}
