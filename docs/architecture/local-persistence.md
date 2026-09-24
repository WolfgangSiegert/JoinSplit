# Local Persistence Architecture

## Purpose

JoinSplit persistiert den lokalen Clientzustand ab M2 dauerhaft im Browser.

Ziele:

- lokale Daten über Reload und Browserneustart erhalten,
- Offline-First-Verhalten fortführen,
- Pending Mutations nach Reload weiter synchronisieren können,
- Pinia als Runtime-State beibehalten,
- Laravel/PostgreSQL nach erfolgreichem Sync als kanonische Serverrepräsentation beibehalten.

## Technology

Persistence:

- IndexedDB

Access library:

- idb

Nicht verwenden:

- Dexie
- localForage
- Pinia persistence plugins
- generic offline/sync frameworks

`idb` ist bewusst als dünner Promise-/TypeScript-Wrapper über IndexedDB gewählt.
JoinSplit implementiert keine eigene IndexedDB-Abstraktionsbibliothek.

## State responsibilities

Pinia
→ Runtime Application State

IndexedDB
→ durable local client state

Laravel/PostgreSQL
→ canonical server representation after successful synchronization

IndexedDB ist kein zweiter Server und kein Server-State-Cache.

## Database

Name:
joinsplit

Aktuelle Schema-Version:
3

Object stores:

- accessIdentity
- groups
- participants
- pendingMutations
- settings
- expenses
- expenseShares

## Persisted state

### Access Identity

Persistieren:

- id
- credential

Das Credential wird benötigt, damit bereits persistierte Pending Mutations nach
einem Reload weiterhin unter derselben Access Identity synchronisiert werden
können.

Credential bleibt getrennt von Domain- und Mutation-Daten.

Es darf nicht vorkommen in:

- Group
- Participant
- Pending Mutation
- URL
- UI
- Logs

Es wird keine zusätzliche clientseitige Verschlüsselung eingeführt, solange
kein vom Browser-State unabhängiges Geheimnis oder geschützter Schlüssel
existiert.

### Groups

Persistieren.

### Participants

Persistieren.

### Pending Mutations

Persistieren.

Ab Schema v2 verwendet die Queue eine explizite diskriminierte Union. Schema v3
umfasst CreateGroup, AddParticipant, RenameParticipant,
DeactivateParticipant, DeleteParticipant, CreateExpense, UpdateExpense und
DeleteExpense. Jeder Eintrag besitzt eine unabhängige lokale UUID und eine
ganzzahlige `createdOrder`. Neue Werte werden als Maximum der vorhandenen Werte
plus eins vergeben; Lücken bleiben zulässig. Die Synchronisation verarbeitet
die Einträge nach `createdOrder` und blockiert spätere Mutationen derselben Group,
solange ein früherer Eintrag nicht bestätigt ist. Mutationen werden nicht
zusammengefasst. Expense-Mutationen enthalten den vollständigen unveränderlichen
Expense-Snapshot einschließlich Shares; DeleteExpense enthält ihn als Tombstone.

Die persistierte Mutation bleibt die kanonische Retry-Eingabe.

Retries dürfen die Mutation nicht aus aktuell verändertem Runtime-State
rekonstruieren.

### Settings

Persistieren.

Insbesondere gehört der globale Default für:
"Mich als Teilnehmer hinzufügen"

zum dauerhaften Benutzerzustand.

JS-020 legt für das geplante Schema v4 zusätzlich
`settlementProposalStrategy: 'deterministic' | 'minimum-transfer'` fest. Der
Initialwert ist `deterministic`. Die Einstellung ist gerätelokal und erzeugt
weder einen API-Aufruf noch eine Pending Mutation.

## Non-persisted state

Nicht persistieren:

- browser connectivity
- syncing state
- sync errors
- form drafts
- validation errors
- focus state
- transient UI state
- HTTP responses
- derived UI state

Nach Reload wird transienter Sync-State neu abgeleitet.

Eine vorhandene Pending Mutation bedeutet wieder `pending`.

## Local write semantics

Ein lokaler Domain-Vorgang gilt erst dann als erfolgreich, wenn seine
dauerhafte IndexedDB-Transaktion erfolgreich committed wurde.

Für Create Group:

validate + prepare
→ IndexedDB transaction
  - Group
  - optional Participant
  - Pending CreateGroup mutation
→ IndexedDB commit
→ Pinia update
→ local success / navigation
→ server synchronization

Bei einem Persistenzfehler dürfen keine entsprechenden Teilzustände als
erfolgreich in Pinia erscheinen.

Für zusammengehörige lokale Domainänderungen werden die benötigten IndexedDB
Stores in einer gemeinsamen Transaktion geschrieben.

Keine generische Unit-of-Work-Abstraktion einführen.

Lokale Schreibvorgänge werden pro Group über alle Participant- und
Expense-Composables serialisiert. Die nächste globale `createdOrder` wird beim
Aufruf synchron reserviert; Lücken nach Validierungs- oder Persistenzfehlern
sind zulässig. Der jeweils aktuelle Pinia-Zustand wird erst innerhalb der
gruppenbezogenen Schreibkette gelesen; anschließend folgen Vorbereitung,
atomare IndexedDB-Transaktion und Pinia-Commit. Damit können zwei gleichzeitig
gestartete Vorgänge weder dieselbe `createdOrder` noch denselben
Participant-`order` aus einem veralteten Snapshot ableiten. Fehler werden an den
Aufrufer propagiert, halten spätere Vorgänge derselben Group aber nicht dauerhaft
auf. Schreibvorgänge verschiedener Groups reservieren nur ihre Reihenfolge
gemeinsam; ihre Persistenz verwendet unabhängige Ketten.

## Rehydration

Beim Clientstart:

1. IndexedDB öffnen
2. Schema erstellen bzw. upgraden
3. Access Identity laden
4. Groups laden
5. Participants laden
6. Pending Mutations laden
7. Expenses und Expense Shares laden und zusammenführen
8. ab Schema v4 Settlements laden
9. Settings laden
10. Pinia hydratisieren
11. App-Lifecycle auf `ready` setzen
12. vorhandene Pending Mutations über die bestehende Sync-Logik fortsetzen

App-Lifecycle-State:

- loading
- ready
- failed

Vor `ready` dürfen keine fachlichen Operationen gestartet und keine neue Access
Identity erzeugt werden.

Die UI darf während `loading` nicht fälschlich einen leeren Domainzustand
darstellen.

## Rehydration failure

Ein Fehler beim Öffnen oder Lesen der lokalen Datenbank führt zu:

- Lifecycle `failed`
- blockierter Domain-UI
- verständlicher Fehlermeldung

Nicht erlaubt:

- automatische IndexedDB-Löschung
- stiller Reset
- automatisches Starten mit leerem State

Ein expliziter Reset lokaler Daten ist ein eigener späterer Use Case.

## Schema upgrades

Schema-Upgrades erfolgen ausschließlich über den IndexedDB-Upgrade-Pfad.

Beispiel:

v1 enthält accessIdentity, groups, participants, pendingMutations und settings.
v2 migriert die Pending-Mutation-Queue auf unabhängige Mutations-IDs und
`createdOrder`. v3 ergänzt expenses und expenseShares und ergänzt bei bestehenden
Groups den irreversiblen Ausgangswert `hasFinancialHistory: false`.

Das in JS-020 definierte, aber noch nicht implementierte Schema v4 ergänzt den
Store `settlements`, die drei vollständigen unveränderlichen Mutationstypen
`CreateSettlement`, `UpdateSettlement` und `DeleteSettlement` sowie die globale
Strategieeinstellung. Settlement-Beträge werden in IndexedDB und den
zugehörigen Pending-Mutation-Snapshots verlustfrei als kanonische
signed-64-kompatible Dezimalstrings gespeichert. Beim Hydratisieren werden
Settlement-Store-Datensätze für den Domain-State in TypeScript-`bigint`
überführt; Settlement-Snapshots in der Pending-Mutation-Queue bleiben dagegen
als unveränderliche Dezimalstrings die kanonische Retry- und API-Eingabe. Der
Upgrade-Pfad von v3 bewahrt alle bestehenden Stores und Datensätze. Details
stehen in
[`settlement-contract.md`](settlement-contract.md).

Kein separates Migrationsframework einführen.

Upgrade-Code bleibt explizit und sequenziell.

Der Upgrade-Pfad v1 → v2 ersetzt den bisherigen `groupId`-Schlüssel der
CreateGroup-Outbox atomar durch die lokale Mutations-ID. Vorhandene
CreateGroup-Einträge werden deterministisch nach ihrem bisherigen Schlüssel
geordnet, erhalten fortlaufende `createdOrder`-Werte und behalten sämtliche
Domain-IDs sowie ihren unveränderten Payload.

Der anschließende Upgrade-Schritt v2 → v3 legt `expenses` mit Schlüssel `id`
und `expenseShares` mit zusammengesetztem Schlüssel
`[expenseId, participantId]` an. Bestehende Records aller älteren Stores bleiben
erhalten. Ein direkter Start von v1 durchläuft beide Schritte in derselben
IndexedDB-Upgrade-Transaktion; eine neue Datenbank wird unmittelbar als v3
angelegt.

## Sync after rehydration

Rehydrierte Pending Mutations verwenden die bereits implementierte
Synchronisationslogik.

Offline:
pending bleibt bestehen.

Online:
bestehende Mutation darf erneut synchronisiert werden.

Dabei werden nicht neu erzeugt:

- Group ID
- Participant ID
- Access Identity ID
- Credential
- Mutation Payload

## Testing

### Vitest

Für:

- Mapping
- Serialization
- pure persistence/domain helpers
- Rehydration-Orchestrierung, soweit browserunabhängig sinnvoll

Keine zusätzliche Fake-IndexedDB-Dependency nur für Unit Tests.

### Playwright

Echte Browser-IndexedDB verwenden.

Mindestens prüfen:

- Group überlebt Reload
- Participant überlebt Reload
- Access Identity bleibt identisch
- Credential ermöglicht Sync nach Reload
- Pending Mutation überlebt Reload
- Offline → Reload → weiterhin pending
- späterer Retry synchronisiert dieselbe Mutation
- keine Group-/Participant-Duplikate

### Pest

Server-Slice bleibt Regressionstest.

## Non-goals

Nicht Bestandteil dieser Architekturphase:

- Multi-Tab synchronization
- BroadcastChannel
- Service Worker
- PWA
- Background Sync API
- IndexedDB encryption framework
- complex data recovery
- data export/import
- generic repository layer
- generic sync engine
- multi-device synchronization
- conflict merge UI
