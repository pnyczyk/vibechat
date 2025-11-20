# Propozycje usprawnień

## Architektura i modularność
- `app/chat-client.tsx` ma ~520 linii łączących UI, audio, telemetrię i MCP; wydziel hooki (np. `useVoiceConnection`, `useMarkdownViewer`, `useMcpTools`) oraz mniejsze komponenty (panel narzędzi, pasek stanu), co uprości przepływ stanu i testy jednostkowe.
- Globalny runtime MCP (`app/lib/mcp/runtime.ts`) uruchamia tracker z wiecznym `setInterval`; warto dodać ref-counting lub wyłączanie, gdy brak serwerów z `trackResources=true` czy aktywnych klientów SSE, aby unikać zombie timerów w dev/HMR.
- `/api/realtime-token/route.ts` za każdym razem pobiera instrukcje i tworzy client secret; rozważ krótki cache (np. 30–60 s lub do zmiany mtime pliku) oraz opcję injectable modelu/transportu, by ułatwić testy i przyszłe profile modeli.
- Audio element tworzony w `app/chat-client.tsx` jest doklejany do `document.body` bez utylizacji; przenieś tworzenie do efektu z `return () => element.remove()` i zamykaniem `AudioContext`, by ograniczyć wycieki w nawigacji.

## Testowanie i jakość
- Brakuje komendy i progu pokrycia wymaganych w AGENTS.md (≥80%); w `jest.config.mjs` dodać `collectCoverage`, `coverageThreshold` i alias `npm run test:coverage`.
- Brak testów `/api/realtime-token`: dodać scenariusze dla braku `OPENAI_API_KEY`, pustych instrukcji oraz udanego zwrotu client secret z mokiem `fetch`.
- E2E skupiają się na happy path (np. `tests/e2e/mcp-tools.spec.ts`); dodać ścieżki błędów: odmowa uprawnień MCP, przerwany stream SSE, nieudany token — z oczekiwanymi komunikatami w UI.
- Dodać testy integracyjne dla ścieżki audio/voice: montaż `ChatClient` powinien sprzątać `AudioContext` i usunąć element audio przy odmontowaniu.

## Wydajność i niezawodność
- `McpResourceTracker` domyślnie sprawdza co 1 s nawet przy pustej konfiguracji; wprowadzić adaptacyjny interwał (np. rosnący backoff lub pauza, gdy brak serwerów) i metrykę własną dla obciążenia.
- `McpAdapter` zawsze odświeża katalog przy `attach`; można zapamiętać `collectedAt` z `/api/mcp/catalog` i pomijać refresh, gdy dane świeże, co ograniczy nadmiarowe żądania w szybkich rekonnekcjach.
- W `ChatClient` pętla `requestAnimationFrame` do analizy audio działa nawet przy braku toru audio (tylko fallback interval wygasza poziomy); dodanie guardu zatrzymującego próbki, gdy `audioElement.srcObject` jest `null`, zmniejszy zużycie CPU na idle.

## Bezpieczeństwo
- `/api/realtime-token` jest publiczne i zwraca szczegóły błędów z OpenAI; wprowadzić prostą autoryzację CSRF/session lub allowlistę originów oraz zamienić `details` na przyjazny komunikat, by nie ujawniać treści odpowiedzi API.
- Dodać nagłówki bezpieczeństwa w `next.config.ts` (CSP z `connect-src` ograniczonym do MCP + OpenAI, `Permissions-Policy` dla mikrofonu, `Cross-Origin-Opener-Policy`/`Resource-Policy`), zgodnie z wymaganiami voice.
- API używa modułów Node (fs, child_process); jawnie ustaw `export const runtime = "nodejs"` w trasach MCP i tokenu, żeby uniknąć przypadkowego wdrożenia na Edge z inną semantyką streamów.

## Developer experience i styl
- Brak skonfigurowanego ESLint/Prettier mimo wymagań AGENTS; dodać `.eslintrc` (bazując na Next + Airbnb TS), `.prettierrc`, komendę `npm run lint` i ewentualnie `lint-staged` dla PR hygiene.
- `tsconfig.json` ma `allowJs` i `skipLibCheck`; wyłączenie `allowJs` i włączenie `skipLibCheck=false` w CI poprawi sygnalizację błędów typów w nowym kodzie.
- Dodać skrypty pomocnicze: `npm run format`, `npm run typecheck` (bez budowy), oraz `npm run test:e2e:ci` z headless server spin-upem, by uprościć CI matrycę.
- Dokumentować i egzekwować porządek importów (zewnętrzne → aliasy → względne) za pomocą `eslint-plugin-import` i automatycznego sortowania, żeby ujednolicić styl w całym repo.

## Dokumentacja i proces
- README opisuje tylko start; rozbudować o sekcję zmiennych środowisk (np. `OPENAI_API_KEY`, `MCP_ADMIN_TOKEN`, `NEXT_PUBLIC_USE_REALTIMEMOCK`), kroki uruchomienia testów oraz mapowanie na workflow SDD (`sdd/README.md`).
- Dodać krótką notkę operational runbook: jak diagnozować MCP (logi w `/tmp/vibechat-dev.log`, curl do SSE), jak restartować serwery oraz co oznaczają metryki telemetryjne (`entryLatencyMs`, zdarzenia markdown).
