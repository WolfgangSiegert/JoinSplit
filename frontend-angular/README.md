# JoinSplit Angular Learning Track

Eine getrennte, idiomatische Angular-Portierung des lokalen JoinSplit-Kernworkflows. Das bestehende Nuxt-Frontend und das Laravel-Backend werden nicht verändert.

## Enthaltener Slice

- Standalone Components und lazy Angular Router routes
- zoneless Angular mit Signals und `OnPush`
- typisierte Reactive Forms
- lokale Access Identity mit Web-Crypto
- atomare Workspace-Persistenz in nativer IndexedDB
- Gruppen-Lifecycle (Erstellen, Archivieren, Reaktivieren, Löschen ohne Finanzhistorie)
- Participant-Erstellung, Rename, Aktivstatus und fachlich begrenztes Löschen
- Expense-Erstellung, Bearbeitung und Löschen mit deterministischem Equal Split
- Balance-Berechnung und beide Settlement-Proposal-Strategien
- Settlement-Erstellung, Bearbeitung, Löschen und Statement-Text
- FIFO-Outbox zur bestehenden anonymen Laravel-API

Der Stand ist absichtlich **nicht vollständig feature-paritätisch**. Die genaue Abweichungsliste steht in [docs/angular-port-review.md](docs/angular-port-review.md).

## Voraussetzungen und Start

- Node `24.20.0` (mindestens `24.15.0`, kleiner als `25`)
- pnpm `8.10.5`
- optional Laravel unter `http://127.0.0.1:8000` für Synchronisierung

```sh
cd frontend-angular
nvm use ../frontend/.nvmrc
pnpm install --frozen-lockfile
pnpm start
```

Angular läuft standardmäßig unter `http://localhost:4200`. Der Development Proxy leitet `/api` an Laravel weiter. Der lokale Kern funktioniert nach dem Laden ohne Laravel.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Lernunterlagen

- [Angular vs. Vue/Nuxt](docs/angular-vs-vue-nuxt.md)
- [Architektur- und Paritätsreview](docs/angular-port-review.md)
- [Startprompt für einen separaten Lernchat](docs/angular-learning-chat-prompt.md)
