'use client';

import { CssBaseline, ThemeProvider } from '@mui/material';
import type { PropsWithChildren } from 'react';
import theme from './theme';

export default function Providers({ children }: PropsWithChildren) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
