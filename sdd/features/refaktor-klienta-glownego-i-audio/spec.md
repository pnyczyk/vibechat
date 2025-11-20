# Feature: Refaktor klienta głównego i audio

## Overview
Refaktoryzacja monolitycznego `ChatClient` i ścieżki audio, aby uprościć zarządzanie stanem, poprawić higienę zasobów audio oraz ułatwić testowanie i dalszy rozwój funkcji głosowych.

## Problem Statement
**What problem are we solving?**
- Klient ma ~500 linii łączących UI, telemetrię, MCP i audio, co utrudnia testy i zmianę logiki.
- Audio element oraz `AudioContext` nie są sprzątane w cyklu życia, co grozi wyciekami i niepotrzebnym zużyciem CPU.
- `/api/realtime-token` zawsze wybija pełny request do OpenAI; brak krótkiego cache powoduje zbędne opóźnienia i zależność od sieci przy każdym wejściu.

**Why now?**
- Zaplanowane dalsze funkcje MCP/voice wymagają stabilnej bazy i niższej złożoności.
- Testy e2e wskazują na idle CPU i okazjonalne ostrzeżenia o AudioContext w dev/HMR.
- Krótki cache tokenu zmniejszy obciążenie podczas intensywnych sesji QA i CI.

## User Stories

### Story 1: Modułowy klient
**As a** developer utrzymujący klienta chat/voice  
**I want to** mieć `ChatClient` rozbity na dedykowane hooki i mniejsze komponenty  
**So that** szybciej dodam lub poprawię funkcje bez ryzyka regresji w całym widoku

**Acceptance Criteria:**
- [ ] `ChatClient` korzysta z wydzielonych hooków dla połączenia głosowego, markdown, MCP tools oraz stanu layoutu.
- [ ] Nowe moduły mają testy jednostkowe pokrywające kluczowe ścieżki (min. 80% linii w nowych plikach).
- [ ] Istniejące e2e scenariusze (`ui-*`, `mcp-*`, markdown) przechodzą bez modyfikacji asercji.

### Story 2: Higiena audio
**As a** użytkownik korzystający z voice UI  
**I want to** żeby audio element i `AudioContext` były tworzone i zamykane wraz z sesją  
**So that** nie obserwuję wzrostu obciążenia ani wycieków po wielokrotnych wejściach/wyjściach

**Acceptance Criteria:**
- [ ] Element `<audio>` dodawany i usuwany w efektach z cleanupem; brak osieroconych elementów po unmount (assert w testach).
- [ ] `AudioContext` zamykany przy odłączeniu/umount; pętla `requestAnimationFrame` zatrzymuje się, gdy brak strumienia.
- [ ] Test integracyjny/snapshot potwierdza brak ostrzeżeń i stabilny poziom CPU na idle (<=5% wzrost w porównaniu z obecną bazą dla mock runtime).

### Story 3: Token route z cache
**As a** operator produktu / QA  
**I want to** aby `/api/realtime-token` używał krótkiego cache zależnego od mtime instrukcji  
**So that** p95 latencja wejścia spada, a chwilowe wahania sieci nie blokują sesji

**Acceptance Criteria:**
- [ ] Token endpoint cache'uje odpowiedź na co najmniej 30–60 s lub do zmiany mtime pliku instrukcji.
- [ ] Testy jednostkowe obejmują brak klucza, pusty plik instrukcji, HIT/MISS cache.
- [ ] Brak regresji bezpieczeństwa: endpoint nadal zwraca błąd przy braku `OPENAI_API_KEY`.

## Success Metrics
- 80%+ pokrycia linii dla nowych/refaktoryzowanych modułów klienta i token route.
- p95 latencja `/api/realtime-token` w dev/CI spada o ≥20% przy seriach wywołań.
- Idle CPU podczas widoku chat z mock runtime nie rośnie >5% względem obecnej bazy (lokalny pomiar).

## Out of Scope
- Zmiany UI/UX wizualne poza wynikającymi z podziału komponentów.
- Migracja na inny model/transport realtime.
- Nowe funkcje MCP lub aktualizacja katalogu narzędzi.

## Dependencies
### External Dependencies
- Dostępność OpenAI Realtime API do generowania client secret.

### Internal Dependencies
- Aktualne telemetry i e2e scenariusze (`tests/e2e/*`) muszą pozostać stabilne.
- Zasady kodu i testów z `AGENTS.md` (Airbnb TS style, min. 80% coverage).

### Assumptions
- Mock runtime (`NEXT_PUBLIC_USE_REALTIMEMOCK=1`) pozostaje dostępny do testów audio.
- Brak podłączonej bazy danych ani dodatkowych serwisów backendowych poza istniejącym MCP.
