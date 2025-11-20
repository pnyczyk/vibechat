# Zgrupowane zadania usprawnień

## 1) Refaktor klienta głównego i audio
- Podziel `app/chat-client.tsx` na hooki (`useVoiceConnection`, `useMarkdownViewer`, `useMcpTools`) i mniejsze komponenty UI.
- Napraw lifecycle audio: tworzenie/cleanup elementu audio + zamykanie `AudioContext`; zatrzymanie pętli `requestAnimationFrame` gdy brak strumienia.
- Wprowadź lekki cache instrukcji/modelu w `/api/realtime-token/route.ts` (np. zależny od mtime pliku) z możliwością wstrzyknięcia transportu do testów.

## 2) MCP: wydajność i stabilność
- Dodać adaptacyjny polling/backoff w `McpResourceTracker` i pauzę przy braku serwerów z `trackResources=true`.
- Usprawnić `McpAdapter`: wykorzystać `collectedAt` z `/api/mcp/catalog` do świeżości katalogu i zmniejszyć liczbę żądań przy rekonnekcjach.
- Doprecyzować cleanup trackerów/timerów przy HMR/dev shutdown.

## 3) Bezpieczeństwo API i nagłówków
- Dodać prostą autoryzację/CSRF lub allowlistę originów dla `/api/realtime-token`; ograniczyć ujawniane `details`.
- Ustawić `export const runtime = "nodejs"` w trasach MCP i tokenu.
- Rozszerzyć `next.config.ts` o nagłówki bezpieczeństwa (CSP, Permissions-Policy dla mikrofonu, COOP/COEP/CORP).

## 4) Jakość kodu i bramki
- Skonfigurować ESLint (Next + Airbnb TS + import-order) i Prettier; dodać `npm run lint`, `npm run format`, `lint-staged`.
- Ustawić w `jest.config.mjs` `collectCoverage` + `coverageThreshold` ≥80% oraz alias `npm run test:coverage`.
- Zaostrzyć typowanie: wyłączyć `allowJs`, włączyć `skipLibCheck=false` w CI i dodać `npm run typecheck`.

## 5) Rozszerzenie testów
- Testy `/api/realtime-token`: brak klucza, puste instrukcje, poprawny secret (mock fetch).
- Testy audio/voice: unmount sprząta `AudioContext` i element audio.
- E2E negatywne: brak uprawnień MCP, przerwany SSE, nieudany token → oczekiwane komunikaty w UI.

## 6) Dokumentacja i runbook
- Uzupełnić README o zmienne środowiskowe, profile uruchomień (dev/test/e2e), mapowanie na workflow SDD.
- Dodać krótki runbook operacyjny: diagnostyka MCP (logi, curl SSE), restart serwerów, znaczenie metryk telemetryjnych.
