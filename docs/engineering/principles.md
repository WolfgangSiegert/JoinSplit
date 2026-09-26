# JoinSplit – Engineering Principles

## Purpose

Dieses Dokument definiert die verbindlichen technischen Leitplanken für die
Entwicklung von JoinSplit.

Es beschreibt Stack, Architekturprinzipien, Qualitätsanforderungen und
Engineering-Regeln.

Konkrete Domain-Modelle, API-Endpunkte, Persistenzschemata und
Implementierungsdetails werden in dafür vorgesehenen Architecture- und
Delivery-Tasks entschieden.

## Engineering Goals

JoinSplit dient gleichzeitig als nutzbares Produkt, Lernprojekt und
Portfolio-Showcase.

Die Engineering-Arbeit soll insbesondere:

- verständliche und wartbare Lösungen bevorzugen,
- PHP und Laravel sauber und framework-nativ einsetzen,
- Nuxt, Vue und TypeScript konsequent einsetzen,
- relevante Fachlogik explizit und testbar halten,
- Mobile First und Accessibility von Anfang an berücksichtigen,
- den bestätigten Offline-First-MVP unterstützen,
- spätere Web-, PWA- und Native-Distribution nicht unnötig erschweren.

## Mandatory Stack

### Frontend

- Nuxt 4
- Vue 3
- TypeScript strict
- Pinia
- Tailwind CSS 4
- Nuxt UI
- pnpm
- mobile first

### Backend

- PHP
- Laravel
- PostgreSQL
- Laravel MVC
- Composer
- Pest

### Quality

- Playwright für Browser- und End-to-End-Tests
- axe-core über Playwright für automatisierbare Accessibility-Prüfungen
- WCAG 2.2 Level AA als primäres Accessibility-Konformitätsziel
- BITV 2.0 und BFSG/BFSGV als zusätzliche Zielanforderungen, soweit für den
  jeweiligen Anwendungskontext einschlägig

## Lean Architecture

Es wird die kleinste verständliche Lösung gewählt, die den aktuellen Use Case
erfüllt.

Neue Infrastruktur, Abstraktionen oder Dependencies werden nicht allein für
mögliche zukünftige Anforderungen eingeführt.

Roadmap-Ziele dürfen heutige Architekturentscheidungen beeinflussen, aber keine
unnötige heutige Implementierung erzwingen.

Zu vermeiden sind insbesondere:

- vorsorgliche Clean-Architecture-Schichten,
- Repository-Abstraktionen ohne konkretes Problem,
- unnötige Interfaces,
- Event Sourcing ohne fachlichen Bedarf,
- CQRS ohne konkreten Nutzen,
- Microservices,
- CRDT-Infrastruktur ohne konkrete Kollaborationsanforderung,
- Cross-Language-Codegenerierung für Domainlogik.

## Clean Code

Bevorzugt werden:

- präzise Namen,
- kleine und fokussierte Verantwortlichkeiten,
- geringe Kopplung,
- hohe Kohäsion,
- explizite Seiteneffekte,
- wenig Duplikation,
- einfache Kontrollflüsse,
- Tests für relevante Fachlogik.

Zu vermeiden sind:

- Cleverness vor Lesbarkeit,
- God Classes,
- Fat Controller,
- unkontrollierte God Models,
- unnötige Kommentare,
- Pattern-Sammlungen ohne konkretes Problem.

## Laravel MVC

Laravel nutzt MVC und Framework-Konventionen.

Controller:

- nehmen HTTP Requests entgegen,
- koordinieren Validation,
- koordinieren Authorization,
- rufen Fach- oder Anwendungslogik auf,
- liefern Responses bzw. API Resources.

Zentrale Fachlogik gehört nicht in Controller.

Dazu zählen insbesondere:

- Expense Splitting,
- Balance Calculation,
- Settlement Planning.

Eloquent Models dürfen Beziehungen und sinnvolles domänennahes Verhalten
enthalten, dürfen aber nicht zu unkontrollierten God Models werden.

Laravel bleibt die kanonische Application API.

Das Backend ist autoritativ für:

- Persistenz,
- serverseitige Validation,
- Authorization,
- serverseitige fachliche Konsistenz.

Clientseitig berechnete fachliche Ergebnisse werden vom Backend nicht blind
übernommen.

## Nuxt Architecture

Nuxt wird framework-nativ strukturiert und nicht künstlich in MVC gepresst.

Bevorzugt werden:

- pages,
- components,
- composables,
- Pinia Stores, wenn echter geteilter Client-Anwendungszustand vorliegt,
- API- oder Service-Layer nur bei konkretem Bedarf.

Fachlogik gehört nicht in Vue-Komponenten.

Kernfunktionen sollen nicht unnötig von Nuxt-Server-only-Code abhängig sein,
damit spätere PWA- und Capacitor-basierte Distribution möglich bleibt.

## Client State

Server State wird nicht ohne konkreten Grund in Pinia gespiegelt.

Grundregel:

Server State
→ useFetch / useAsyncData bzw. geeignete server-state-nahe Mechanismen

Lokaler UI-State
→ Component oder Composable

Geteilter veränderbarer Client-State
→ Pinia

Der bestätigte Offline-First-MVP erzeugt echten geteilten Client-State,
beispielsweise für:

- Connectivity,
- ausstehende Mutationen,
- Sync-Status,
- Fehlerzustände der Synchronisation.

Für diesen Bereich ist die Pinia-Schwelle erreicht.

## Server-State Freshness and SWR

Für gelesenen Server State darf stale-while-revalidate als UX- und
Freshness-Muster eingesetzt werden.

Das Muster bedeutet fachlich:

- vorhandene Daten können unmittelbar angezeigt werden,
- im Hintergrund kann ein aktuellerer Serverstand geladen werden,
- ein neuerer Stand kann die Darstellung anschließend aktualisieren.

Stale-while-revalidate ersetzt weder lokale Offline-Persistenz noch die
Synchronisation von Offline-Mutationen.

Die Verantwortlichkeiten bleiben getrennt:

Server-State Freshness
→ Revalidation / SWR

Offline Read
→ lokale Persistenz

Offline Write
→ Pending Mutations / Outbox und Synchronisation

Framework-native Nuxt-Mittel werden zunächst bevorzugt.

Zusätzliche Query- oder Caching-Dependencies werden nur eingeführt, wenn dafür
ein konkreter Bedarf nachgewiesen ist.

## Money and Domain Logic

Persistierte Geldbeträge werden nicht mit binären Floating-Point-Typen
modelliert.

Geld wird fachlich in der kleinsten relevanten Währungseinheit behandelt.

Für den MVP gilt bei Equal Split:

- ausgewählte Participants erhalten grundsätzlich gleiche Anteile,
- nicht exakt teilbare Restbeträge werden deterministisch verteilt,
- die Summe aller Anteile entspricht exakt dem ursprünglichen Expense-Betrag.

Die konkrete Domain-Modellierung wird separat festgelegt.

## Cross-Client Domain Logic

Offline relevante Kernfachlogik muss sowohl ohne Backend-Verbindung als auch
serverseitig zuverlässig ausführbar sein.

Dazu gehören insbesondere:

- Equal Split,
- Balance Calculation,
- Settlement Proposal.

Diese Regeln werden sowohl:

- im Laravel/PHP-Backend,
- als auch im TypeScript-Client

idiomatisch implementiert.

Beide Implementierungen folgen denselben fachlichen Regeln und werden anhand
gemeinsamer fachlicher Beispielszenarien bzw. Testvektoren gegengeprüft.

Es wird keine technische Cross-Language-Abstraktion oder Codegenerierung
eingeführt.

## Offline-First Engineering Principles

Offline First ist eine bestätigte MVP-Anforderung und beginnt mit der Nutzung
ohne Account und der Erstellung einer Group. Eine initiale Verbindung zur
Laravel-API ist nicht erforderlich. Ohne Service Worker garantiert der aktuelle
Web-Release jedoch keinen erstmaligen oder erneuten Start der App Shell ohne
Netzwerk. Der verbindliche fachliche Offline-Umfang steht in
`docs/product/mvp.md`.

### Server Authority

Laravel und PostgreSQL bleiben die kanonische serverseitige Repräsentation der
gemeinsamen Daten. Für den veröffentlichten M4-Portfolio-Release gilt dies nur
innerhalb seiner aktiven Aufbewahrungsperiode. Der zeitlich begrenzte
Demo-Betrieb ist keine dauerhafte Backup- oder Recovery-Zusage.

Offline First macht den Browser nicht zur dauerhaften alleinigen Source of
Truth.

### Local Persistence

Für den Offline-Kernworkflow müssen relevante Daten lokal verfügbar sein.
Lokal erstellte, noch nicht synchronisierte Groups und ihre Kernfachdaten sind
bis zur Synchronisation gültiger MVP-Client-State. Ein vorheriges Laden vom
Server ist keine Voraussetzung.

Zu diesen lokalen Daten gehören insbesondere:

- Group,
- Participants,
- Expenses und ExpenseShares,
- Settlements,
- notwendige Sync-Metadaten.

Es wird kein pauschaler vollständiger Offline-Spiegel aller Serverdaten
aufgebaut.

Die konkrete Client-Persistenztechnologie wird separat entschieden.

### Offline Mutations

Lokale Änderungen einschließlich offline erstellter Groups werden sofort lokal
wirksam und explizit als noch zu synchronisierende Mutationen behandelt.
Die Synchronisation mit Laravel erfolgt, sobald eine Netzwerkverbindung
verfügbar ist. Nach der Synchronisation bleiben Laravel und PostgreSQL die
kanonische serverseitige Repräsentation.

Konzeptionell:

lokale Änderung
→ lokal persistieren
→ als ausstehend markieren
→ mit Laravel synchronisieren
→ erfolgreichen oder fehlgeschlagenen Sync sichtbar behandeln

### Conflict Handling

Der MVP verwendet ein Single-Owner-Modell.

Konfliktbehandlung wird deshalb bewusst einfach gehalten.

Konflikte sollen erkannt und deterministisch behandelt werden.

Eine komplexe:

- CRDT-Lösung,
- kollaborative Merge-Infrastruktur,
- manuelle Conflict-Merge-Oberfläche

wird ohne konkreten Bedarf nicht eingeführt.

Die genaue Versionierungs- und Konfliktstrategie wird separat entschieden.

### Separate Offline Concerns

Folgende Probleme werden getrennt betrachtet:

- Anwendung bzw. App Shell offline verfügbar machen,
- Fachdaten lokal offline verfügbar machen,
- lokale Änderungen mit Laravel synchronisieren.

Ein Service Worker allein löst nicht alle drei Bereiche.

## PostgreSQL

PostgreSQL bleibt die kanonische Backend-Datenbank.

Das fachliche Modell von JoinSplit besitzt starke relationale Beziehungen und
Invarianten.

Offline First ist kein Grund, die serverseitige relationale Persistenz
aufzugeben.

Eine lokal verwendete Client-Datenbank oder Persistenz darf technisch anders
aufgebaut sein und wird anhand der konkreten Offline-Anforderungen entschieden.

## Multi-Platform Direction

JoinSplit wird:

web first
mobile first

entwickelt.

Langfristig soll dieselbe Frontend-Codebasis als:

- responsive Webanwendung,
- PWA,
- native iOS-App,
- native Android-App

ausgeliefert werden können.

Für native Distribution ist Capacitor derzeit die bevorzugte Richtung.

Laravel bleibt die kanonische Application API.

API-URL, CORS und Authentifizierung müssen später mehrere Client-Ursprünge
unterstützen können.

Noch nicht vorsorglich einzuführen sind:

- Capacitor,
- native iOS-Projekte,
- native Android-Projekte,
- vollständige PWA-Installations- und Distributionsfeatures.

Offline-First-Technik darf eingeführt werden, wenn sie für den bestätigten
MVP-Use-Case konkret erforderlich ist.

## Dependency Rules

Eine neue Dependency benötigt eine nachvollziehbare Begründung.

Vor ihrer Einführung wird mindestens geklärt:

1. Welches konkrete aktuelle Problem wird gelöst?
2. Warum reichen Framework- oder Plattformmittel nicht aus?
3. Welche einfacheren Alternativen existieren?
4. Welche langfristigen Wartungskosten entstehen?

Codex darf Dependencies nicht stillschweigend hinzufügen.

Dies gilt ausdrücklich auch für:

- Offline-Datenbanken,
- Sync-Frameworks,
- Query-/Caching-Libraries,
- PWA-Plugins,
- Service-Worker-Tooling.

## Accessibility

Accessibility ist eine Produkt- und Engineering-Anforderung von Beginn an.

JoinSplit zielt auf Konformität mit:

- WCAG 2.2 Level AA,
- BITV 2.0, soweit einschlägig,
- BFSG und BFSGV, soweit einschlägig.

Zusätzlich werden relevante europäische technische Standards wie EN 301 549
berücksichtigt, soweit sie für den jeweiligen Anwendungskontext maßgeblich
sind.

Bei Änderungen der einschlägigen Standards wird der aktuelle Stand überprüft.

Eine formale Konformitätsbehauptung wird erst nach entsprechender Prüfung
gemacht.

### Accessibility by Default

Accessibility wird nicht als nachgelagerte Korrekturphase behandelt.

Neue UI und neue Interaktionsmuster werden von Beginn an barrierefrei geplant,
implementiert und getestet.

Bevorzugt werden insbesondere:

- semantisches HTML vor ARIA,
- vollständige Tastaturbedienbarkeit,
- logische Fokusreihenfolge,
- sichtbarer Fokus,
- Fokus, der nicht durch andere UI verdeckt wird,
- korrekt beschriftete Form Controls,
- verständliche Validierungs- und Fehlermeldungen,
- ausreichende Farbkontraste,
- keine ausschließlich farbbasierte Informationsvermittlung,
- korrekte Überschriften- und Landmark-Struktur,
- ausreichend große Pointer- und Touch-Ziele,
- Alternativen zu Drag-only-Interaktionen,
- sinnvolle accessible names,
- Screenreader-vermittelbare Statusänderungen,
- Unterstützung von Zoom und Reflow,
- Berücksichtigung von Reduced Motion,
- mobile und touchbasierte Bedienbarkeit.

## Testing Strategy

Tests werden dort eingesetzt, wo sie relevante Risiken absichern.

### PHP / Pest

Pest testet insbesondere:

- Domainlogik,
- Equal Split,
- Balance Calculation,
- Settlement Proposal,
- relevante Validation,
- Authorization,
- API-/Feature-Verhalten.

### TypeScript

Clientseitige Tests sichern insbesondere:

- offline relevante Domainlogik,
- identische fachliche Testvektoren,
- Sync-nahe Logik,
- relevante Stores und Composables mit echter Anwendungslogik.

### Playwright

Playwright testet kritische User Flows im Browser.

Dazu gehören schrittweise insbesondere:

- Kernworkflows des MVP,
- relevante Offline-Flows,
- Fehler- und Sync-Zustände,
- Tastatur- und Fokusabläufe.

### Accessibility Testing

axe-core wird mit Playwright für automatisierbare Accessibility-Prüfungen
eingesetzt.

Automatisierte Accessibility-Tests sind kein vollständiger
Konformitätsnachweis.

Zusätzlich werden für relevante User Flows manuelle Prüfungen durchgeführt,
insbesondere für:

- Tastaturbedienung,
- Fokusreihenfolge und Fokusdarstellung,
- Screenreader-Nutzung,
- Zoom und Reflow,
- Farbkontraste,
- Formulare und Fehlermeldungen,
- Touch- und Mobile-Bedienung,
- dynamische Statusmeldungen.

## General Definition of Done

Diese allgemeine Definition of Done gilt zusätzlich zur bestehenden
Accessibility Definition of Done für User-facing Features.

Soweit für die Änderung relevant und die entsprechenden Checks vorhanden und
konfiguriert sind, müssen automatisierte Tests, Typechecking, Linting und
Formatierungsprüfungen erfolgreich sein. Daraus entsteht keine Pflicht, noch
nicht eingerichtete Tools zu installieren oder zu konfigurieren.

Bei Änderungen an Verhalten, Architektur oder dauerhaften Entscheidungen wird
die relevante Dokumentation aktualisiert.

Produktive Änderungen berücksichtigen zusätzlich den freigegebenen Vertrag für
Retention, Logs, Backup, Restore und manuelle Freigabe in
`docs/engineering/production-operations.md`, sobald dieser Release-Pfad
betroffen ist.

Vor Integration oder Commit muss der Mensch die Änderung prüfen und verstehen.

## Definition of Done for User-Facing Features

Ein User-facing Feature gilt nicht allein deshalb als fertig, weil die
fachliche Happy-Path-Funktion funktioniert.

Soweit für das Feature relevant, muss zusätzlich geprüft werden:

- Tastaturbedienung funktioniert,
- Fokus ist sichtbar und sinnvoll geführt,
- Form Controls besitzen korrekte Labels,
- relevante Status- und Fehlermeldungen sind zugänglich,
- Informationen werden nicht ausschließlich über Farbe vermittelt,
- mobile und responsive Bedienung funktioniert,
- automatisierte axe-Prüfungen zeigen keine relevanten Verstöße im getesteten
  Flow,
- das Interaktionsmuster wurde gegen relevante WCAG-Anforderungen geprüft.

Zentrale User Flows erhalten zusätzlich eine manuelle Accessibility-Prüfung.

## Git and Publishing Guardrails

Das öffentliche Source-Repository und der bestehende `origin`-Remote sind
Bestandteil des Projekts:

https://github.com/WolfgangSiegert/JoinSplit

Materielle Git- und Publishing-Schritte benötigen jeweils eine separate
ausdrückliche menschliche Freigabe:

- Änderungen implementieren bedeutet nicht automatisch committen.
- Commit-Freigabe bedeutet nicht automatisch integrieren.
- Integrationsfreigabe bedeutet nicht automatisch pushen.
- Push-Freigabe bedeutet nicht automatisch einen Pull Request erstellen.

Ohne passende Freigabe bleiben Änderungen im aktuellen lokalen Arbeitsstand.
Kein neues Repository, Remote-Wechsel, Force-Push oder History Rewrite ohne eine
ausdrückliche Freigabe genau dieser Operation.

## AI and Codex Delivery

Der Mensch verantwortet Produkt- und Architekturentscheidungen sowie die
Freigaben für Commit, Integration und Veröffentlichung.

ChatGPT verantwortet insbesondere:

- Product Ownership,
- Architektur,
- Task-Zerlegung,
- Lernunterstützung,
- Agent-Briefing,
- Review,
- Vorbereitung und Koordination der Integration.

Codex bearbeitet klar abgegrenzte Ausführungsaufgaben. Nach einer ausdrücklichen
menschlichen Freigabe darf Codex auch den konkret benannten Commit-,
Integrations- oder Publishing-Schritt ausführen und muss das Ergebnis
überprüfbar berichten.

Vor Codex-Delegation müssen mindestens klar sein:

- Goal,
- Scope,
- Non-Goals,
- Acceptance Criteria,
- relevante Constraints.

Codex entscheidet nicht selbstständig über Produktumfang oder Architektur.

Dependencies dürfen nicht stillschweigend ergänzt werden.

### Learning Safeguard

Agent-Ausführung darf das erste eigene Verständnis wichtiger Laravel-Konzepte
nicht verdecken. Im initialen Lerndurchlauf versteht der Mensch das relevante
Konzept, bevor er wesentliche Implementierungsarbeit delegiert, insbesondere
bei Migrations, Eloquent Models und Beziehungen, Controllern, Form Requests /
Validation, Policies / Authorization und Feature-Tests.

Der Mensch muss nicht jede Zeile selbst schreiben. Codex darf unterstützen,
sobald das Lernziel verstanden und die Aufgabe klar abgegrenzt ist.

### Parallelization

Nur tatsächlich unabhängige Arbeit wird parallelisiert. Bei abhängigen Aufgaben
werden vor der Parallelisierung stabile Grenzen, Verträge und Tests bevorzugt.
Mehrere Agenten dürfen nicht gleichzeitig dieselben Kerndateien, fachlichen
Regeln oder API-Verträge ändern.

Die Koordination dient der Vermeidung von Integrationskonflikten und soll keinen
unnötigen Prozessaufwand erzeugen.

## Explicitly Not Decided Yet

Dieses Dokument legt bewusst noch nicht fest:

- konkrete lokale Client-Datenbank,
- IndexedDB-Abstraktion,
- Query-/Caching-Library,
- konkretes SWR-Tooling,
- konkrete Sync-Library,
- Outbox-Datenstruktur,
- Versionierungsstrategie,
- Konfliktalgorithmus,
- Service-Worker-Technologie,
- PWA-Plugin,
- konkrete Authentifizierungs- oder Session-Technologie,
- konkrete API-Endpunkte,
- Domain-Modell und Datenbankschema.

Diese Entscheidungen werden erst getroffen, wenn der jeweilige konkrete Use
Case und seine Anforderungen ausreichend definiert sind.
