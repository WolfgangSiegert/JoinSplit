# Angular vs. Vue/Nuxt anhand von JoinSplit

## Ausgangspunkt

Der Vergleich bezieht sich auf die reale Codebasis, nicht auf isolierte Tutorial-Beispiele. Dauerhafte Produkt- und Fachverträge bleiben in den übergeordneten `docs/` maßgeblich. Die Angular-App ist ein Lerntrack und keine neue kanonische Frontend-Entscheidung.

## 1. Bootstrap und Anwendungsgrenze

Nuxt startet die Anwendung über `frontend/app/app.vue`; Plugins, Auto-Imports und dateibasiertes Routing stellt Nuxt bereit. Angular startet explizit über `frontend-angular/src/main.ts` und `frontend-angular/src/app/app.config.ts`.

Angular-Lernpunkt: `bootstrapApplication` und Application Provider machen die globale Grenze sichtbar. `provideAppInitializer` hydratisiert IndexedDB, bevor fachliche Routen bedient werden. Das entspricht fachlich der Initialisierung in `frontend/app/stores/application-lifecycle.ts`, ist aber DI-basiert statt Pinia-/Nuxt-basiert.

## 2. Routing und Views

Nuxt erzeugt Routen aus Dateien wie `frontend/app/pages/groups/new.vue`, `frontend/app/pages/groups/[id]/balances/index.vue` und `frontend/app/pages/groups/[id]/settlements/new.vue`.

Angular deklariert dieselben Lernrouten in `frontend-angular/src/app/app.routes.ts` und lädt jede Page mit `loadComponent` lazy. Die Parameter werden in den Pages über `ActivatedRoute` und `toSignal` gelesen, zum Beispiel in `frontend-angular/src/app/features/balances/balances.page.ts`.

Bewertung: Das ist idiomatisches Angular. Eine mechanische Abbildung der Nuxt-Ordner in Angular-Module wäre unnötig; featurebezogene Standalone Components reichen hier aus.

## 3. Komponenten und Templates

Vue Single File Components bündeln `<script setup>`, Template und Style. Beispiele sind `frontend/app/components/ExpenseForm.vue` und `frontend/app/components/SettlementForm.vue`.

Angular Components deklarieren Imports und Change Detection explizit. Die Lernformulare stehen in `frontend-angular/src/app/features/expenses/expense-create.page.ts` und `frontend-angular/src/app/features/settlements/settlement-create.page.ts`.

Angulars `@if` und `@for` entsprechen konzeptionell `v-if` und `v-for`, sind aber Teil der Angular-Template-Syntax. Eine konkrete Grenze: Angular-Templates akzeptieren keine TypeScript-BigInt-Literale wie `0n`. Deshalb liegt die BigInt-Vorzeichenprüfung als typisierte Methode in `balances.page.ts`.

## 4. Reaktivität: Vue refs/computed vs. Angular Signals

Der Nuxt-Client verwendet Vue `ref`, `reactive` und `computed`, etwa in `frontend/app/stores/settings.ts` und den Page Components.

Der Angular-Track verwendet `signal` für veränderbaren UI- und Workspace-Zustand, `computed` für abgeleitete Gruppen, Salden und Proposals sowie `toSignal` an Router- und Form-Observable-Grenzen. Der zentrale Einstieg ist `frontend-angular/src/app/core/state/workspace.store.ts`.

Wichtige Abgrenzung: Signals ersetzen RxJS nicht pauschal. Signals modellieren synchronen Anwendungszustand. `HttpClient` bleibt Observable-basiert; `frontend-angular/src/app/core/api/sync.service.ts` konsumiert Requests mit `firstValueFrom`. Für komplexe Streams wären RxJS-Operatoren weiterhin die passendere Ebene.

## 5. Pinia vs. injizierbarer Signal-Service

Das produktive Frontend hält geteilten, veränderbaren Offline-State in Pinia, besonders in `frontend/app/stores/groups.ts`. Die Angular-Portierung nutzt einen root-provided `WorkspaceStore`.

Warum kein NgRx:

1. Der aktuelle Slice braucht einen geteilten Workspace und eine lineare Outbox, aber keine komplexe Event-/Effect-Landschaft.
2. Angular Signals plus ein injizierbarer Service lösen das konkrete Problem mit weniger API- und Lernballast.
3. NgRx wäre erst sinnvoll, wenn mehrere unabhängige Domains, umfangreiche Effects, DevTools-Replay oder formalisierte Event-Semantik einen nachweisbaren Nutzen erzeugen.

Das ist analog zur JoinSplit-Pinia-Regel: nicht jeder Zustand gehört in einen globalen Store. Formularentwürfe bleiben in den Page Components. Kritisch: Nach der Lifecycle-Erweiterung ist der Store mit rund 550 Zeilen zu groß. Signals und DI machen einen Service nicht automatisch gut geschnitten; der nächste Refactor muss Command-Vorbereitung in frameworkfreie Domainfunktionen verschieben.

## 6. Dependency Injection

Vue kann Services und Stores importieren oder über `provide/inject` bereitstellen. Angular DI ist ein primäres Architekturmittel: `WorkspaceRepository` kapselt IndexedDB, `WorkspaceStore` koordiniert lokale Transaktionen und Signals, `SyncService` kapselt HTTP-Outbox-Verarbeitung, und Pages beziehen diese Verantwortlichkeiten mit `inject(...)`.

Die Trennung ist in `frontend-angular/src/app/core/` sichtbar. Interfaces nur für potenzielle Austauschbarkeit wurden bewusst nicht ergänzt.

## 7. Forms

Vue nutzt in `frontend/app/components/ExpenseForm.vue` lokalen reaktiven Draft-State und explizite Domain-Validation. Angular nutzt typisierte Reactive Forms (`FormGroup`, `FormControl`) für Feldzustand und UI-Validation. Fachliche Regeln wie Minor-Unit Parsing, Equal Split und Kalenderdatum bleiben in `frontend-angular/src/app/core/domain/ledger.ts`.

Best Practice: Template-/Required-Validation darf im Form leben; Geld-, Split- und Domain-Invarianten gehören nicht in die Component. Signal Forms wurden nicht gewählt, obwohl Angular 22 sie anbietet: Für einen stabilen Vergleich und breit etablierte Produktionspraxis sind Reactive Forms hier die konservativere Wahl.

## 8. Fachlogik bleibt frameworkfrei

Die produktiven Funktionen liegen unter `frontend/app/domain/`, unter anderem in `expense.ts`, `balance.ts`, `settlement-proposal.ts` und `statement-snapshot.ts`.

Der Angular-Track hält dieselbe Grenze unter `frontend-angular/src/app/core/domain/`. Der exakte Proposal-Algorithmus wurde aus `frontend/app/domain/settlement-proposal.ts` übernommen und nur an strengere Angular-TypeScript-Compilerregeln angepasst. Das demonstriert Portabilität besser als eine Angular-Service-Neuimplementierung der Mathematik.

## 9. Persistenz und lokale Transaktionen

Nuxt verwendet `idb` und mehrere Stores in `frontend/app/persistence/database.ts`. Angular verwendet für den begrenzten Lernslice die native IndexedDB API in `frontend-angular/src/app/core/persistence/workspace.repository.ts`.

`WorkspaceStore` serialisiert lokale Writes und aktualisiert Signals erst nach erfolgreichem IndexedDB-Commit:

```text
validieren und vorbereiten
→ IndexedDB-Transaktion
→ Commit
→ Signal-State aktualisieren
→ sichtbarer lokaler Erfolg
```

Das erhält die wichtige Erfolgsgrenze. Die vereinfachte Snapshot-Persistenz ist jedoch keine vollständige Portierung des produktiven Schema-v10-Modells; siehe Review.

## 10. API und RxJS

Die Laravel-Routen stehen in `backend/routes/api.php`, die maschinenlesbare Beschreibung in `docs/api/openapi.json`. Der Angular-Track spricht die anonymen Mutation-Endpunkte über `HttpClient` an und verwendet dieselben Identity Header `X-Access-Identity-ID` und `Authorization: Bearer <credential>`.

`proxy.conf.json` hält lokale Browser-Requests same-origin. Das ist nur Development-Konfiguration; eine produktive API-Origin-Konfiguration fehlt bewusst.

## 11. Tests

Nuxt verwendet Vitest und Playwright. Angular 22 verwendet im neuen CLI-Setup ebenfalls Vitest. Beispiele sind `frontend-angular/src/app/core/domain/ledger.spec.ts`, `frontend-angular/src/app/core/domain/settlement-proposal.spec.ts` und `frontend-angular/src/app/app.spec.ts`.

Die Tests decken Minor Units, Rest-Cents, Zero-Sum-Balances, Settlement-Regeln und deterministische Proposals ab. Die Equal-Split-Tests lesen direkt `docs/architecture/fixtures/equal-split-vectors.json`. `frontend-angular/e2e/core-flow.spec.ts` prüft den mobilen Kernflow in Chromium und führt axe auf zentralen Views aus. Proposal-/Settlement-Fixtures und manuelle Accessibility-Prüfungen bleiben offen.
