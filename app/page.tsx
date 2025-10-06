import { ChatClient } from './chat-client';
import styles from './chat-client.module.css';

export default function HomePage() {
  return (
    <main className={styles.main}>
      <ChatClient />
    </main>
  );
}
