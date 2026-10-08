# Architektur- und Paritätsreview

## Urteil

Für den implementierten Lernslice ist die Struktur an den Framework-Grenzen überwiegend idiomatisch für erfahrene Angular-Entwickler: Standalone Components, lazy Routes, zoneless Change Detection, `OnPush`, Signals für synchronen State, RxJS an Observable-Grenzen, typisierte Reactive Forms und DI-getrennte Persistenz/API-Verantwortlichkeiten.

Eine Aussage wie „funktional äquivalent zum aktuellen Nuxt-Frontend“ wäre dennoch falsch. Der produktive Client umfasst rund 13.500 Zeilen App-Code plus umfangreiche Tests und enthält M5–M7-Funktionen, die dieser Track nicht portiert. Der aktuelle Stand ist eine authentische Portierung des finanziellen Single-Owner-Kernworkflows, keine vollständige Produktportierung.

## Idiomatisch und beizubehalten

- Standalone statt vorsorglicher NgModules.
- Lazy Pages in `src/app/app.routes.ts`.
- Root-DI für langlebige Infrastruktur, lokaler Form-State in Pages.
- Keine State-Library ohne belegten Bedarf.
- Signals für Workspace-State; RxJS nicht als universeller State-Ersatz.
- Fachlogik ohne Angular-Abhängigkeiten.
- Persist-before-publish bei lokalen Writes.
- Keine Änderungen an `frontend/` oder `backend/`.

## Kritische Punkte

### 1. `WorkspaceStore` hat seine Wachstumsschwelle überschritten

`src/app/core/state/workspace.store.ts` umfasst nach Update/Delete und Lifecycle rund 550 Zeilen und vereint Commands für vier Aggregate. Das ist kein vorbildlicher Endzustand. Die zentrale serialisierte Persist-before-publish-Transaktion ist sinnvoll, aber Validation und Command-Vorbereitung sollten als nächster Refactor in frameworkfreie Group-, Participant-, Expense- und Settlement-Domainfunktionen wandern. Dünne Facades allein wären nur zusätzliche Schichten ohne bessere Kohäsion.

### 2. IndexedDB ist bewusst vereinfacht

Die Angular-App speichert Identity und einen Workspace-Snapshot in zwei Object Stores. Das wahrt Credential-Trennung und atomaren Commit, aber nicht die granularen Stores, Upgrades und Validierungen aus `frontend/app/persistence/database.ts`. Es gibt aktuell nur Schema v1 und keine Migrationstests.

### 3. Sync-Reconciliation ist unvollständig

Die Outbox verwendet korrekte Endpunkte, Header und Payload-Grundformen. Erfolgsantworten werden jedoch nur über HTTP-Status akzeptiert. Das produktive Frontend vergleicht Serverantworten feldweise, zum Beispiel in `frontend/app/services/create-group-sync.ts` und `frontend/app/services/expense-sync.ts`. Für eine produktionsnahe Portierung muss diese Reconciliation übernommen und getestet werden.

### 4. Settlement-Validation ist portiert, die Bestätigungs-UX bleibt vereinfacht

Gegenrichtung, Überzahlung und die strengeren Regeln für inaktive Teilnehmer werden lokal vor dem Commit geprüft; Updates rechnen das bestehende Settlement vorher aus dem Saldo heraus. Die Bestätigung verwendet derzeit den nativen Browserdialog. Das ist funktional und tastaturbedienbar, aber keine gute endgültige Produkt-UX und kein idiomatisches Angular-Overlay.

### 5. Accessibility ist automatisiert geprüft, aber nicht vollständig nachgewiesen

Der mobile Kernflow läuft in Chromium mit Playwright und axe (`e2e/core-flow.spec.ts`). Der Test hat ein unbeschriftetes Statement-Feld gefunden, das korrigiert wurde. Eine manuelle Screenreader-, Zoom- und Mehrbrowser-Prüfung fehlt weiterhin; daher keine WCAG-Konformitätsbehauptung.

## Funktionsmatrix

| Bereich                  | Angular-Stand                             | Abweichung                                                       |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------- |
| Gruppen                  | Create, Archive, Reactivate, Delete + API | Umbenennen fehlt; Delete erst nach Sync und nur ohne Historie    |
| Participants             | Add, Rename, Status, Delete + API         | Person-Zuordnung fehlt; native Confirm/Prompt sind reduzierte UX |
| Expenses                 | Create/Update/Delete + Equal Split        | Serverantwort-Reconciliation fehlt                               |
| Balances                 | umgesetzt                                 | Detailseite pro Participant fehlt                                |
| Settlement Proposal      | beide Strategien, exakter Algorithmus     | Proposal-Fixture-Datei noch nicht direkt eingebunden             |
| Settlements              | Create/Update/Delete + lokale Regeln      | Bestätigung nur als nativer Browserdialog                        |
| Statement                | statischer Gruppentext                    | participantbezogene Detailzeilen und System Share fehlen         |
| Offline                  | IndexedDB nach erstem Laden               | kein Service Worker/PWA-Cold-Start                               |
| Accounts/Multi-Device    | nicht portiert                            | gesamter M5-Vertrag offen                                        |
| People/global navigation | nicht portiert                            | M6.5 offen                                                       |
| PWA/Capacitor            | nicht portiert                            | ausdrücklich außerhalb des aktuellen Web-Scopes                  |
| i18n/settings/theme      | minimal                                   | produktive Settings und Deutsch/Englisch fehlen                  |

## Dependencies

Neue Laufzeitabhängigkeiten beschränken sich auf Angular Core-Pakete, RxJS und `tslib`; Test/Build verwenden das offizielle Angular-CLI-Setup mit Vitest/jsdom. Playwright und `@axe-core/playwright` sind reine Entwicklungsabhängigkeiten und entsprechen dem bestehenden JoinSplit-Qualitätsstack. Keine zusätzliche State-, IndexedDB-, UI-, Money- oder Sync-Library wurde eingeführt.

Begründung: Angular/RxJS sind der Zweck des Lerntracks; native IndexedDB reicht für den begrenzten Snapshot-Vertrag; `bigint` und Minor Units reichen für Geldwerte; eigenes CSS reicht für die visuelle Annäherung ohne zweite Design-System-Dependency.

Angular `22.2.2` wurde am 2026-10-08 als aktuelle stabile Registry-Version geprüft. Die offizielle Kompatibilität verlangt für Angular 22 unter anderem Node `^24.15.0`; das Repository stellt Node `24.20.0` bereit. Quellen: [Angular Releases](https://angular.dev/reference/releases), [Version Compatibility](https://angular.dev/reference/versions).

## Empfohlene nächste Schritte

1. `WorkspaceStore` entlang der vorhandenen Domain-Grenzen refaktorieren, ohne reine Durchreich-Facades zu erzeugen.
2. Serverantwort-Reconciliation und robuste Retry-Klassifikation ergänzen.
3. Auch Settlement-Proposal- und Settlement-Vertrags-Fixtures direkt in den Angular-Testlauf einbinden.
4. Native Prompt-/Confirm-Dialoge durch zugängliche Angular-Dialogkomponenten ersetzen.
5. Erst danach entscheiden, ob Accounts/People für das Lernziel ausreichend wertvoll sind.

Accounts, PWA und Capacitor gleichzeitig zu portieren wäre kein sinnvoller nächster Slice; das würde Angular-Lernen mit drei unabhängigen Architekturthemen vermischen.
