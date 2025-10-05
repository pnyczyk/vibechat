import type { Metadata } from 'next';
import React from 'react';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'VibeChat',
  description: 'Realtime assistant demo powered by OpenAI agents.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
