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

Initial schema version:
1

Object stores:

- accessIdentity
- groups
- participants
- pendingMutations
- settings

Spätere Domainobjekte werden nur bei konkretem Bedarf über explizite
Schema-Upgrades ergänzt.

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

Die persistierte Mutation bleibt die kanonische Retry-Eingabe.

Retries dürfen die Mutation nicht aus aktuell verändertem Runtime-State
rekonstruieren.

### Settings

Persistieren.

Insbesondere gehört der globale Default für:
"Mich als Teilnehmer hinzufügen"

zum dauerhaften Benutzerzustand.

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

## Rehydration

Beim Clientstart:

1. IndexedDB öffnen
2. Schema erstellen bzw. upgraden
3. Access Identity laden
4. Groups laden
5. Participants laden
6. Pending Mutations laden
7. Settings laden
8. Pinia hydratisieren
9. App-Lifecycle auf `ready` setzen
10. vorhandene Pending Mutations über die bestehende Sync-Logik fortsetzen

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

v1
- accessIdentity
- groups
- participants
- pendingMutations
- settings

später beispielsweise:
v2
- expenses
- expenseShares

Kein separates Migrationsframework einführen.

Upgrade-Code bleibt explizit und sequenziell.

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
