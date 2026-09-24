# JoinSplit – Initial Domain Model

## Purpose

Dieses Dokument beschreibt das initiale fachliche Domain-Modell von JoinSplit.

Es definiert:

- zentrale Domain-Begriffe,
- Beziehungen zwischen ihnen,
- fachliche Invarianten,
- relevante Lebenszyklen,
- abgeleitete fachliche Ergebnisse.

Das Dokument ist kein Datenbankschema und keine Laravel-Implementierung.

Insbesondere legt es noch nicht fest:

- Tabellen,
- Spaltennamen,
- Foreign-Key-Namen,
- Eloquent Models,
- API-Endpunkte,
- Request- oder Resource-Klassen,
- Client-Persistenz,
- Sync-Datenstrukturen.

## Domain Overview

Der fachliche Kern des MVP besteht aus:

- Group
- Participant
- Expense
- ExpenseShare
- Settlement
- Access Identity

Zusätzlich entstehen aus diesen Daten abgeleitete fachliche Ergebnisse:

- Participant Balance
- Settlement Proposal
- Statement Snapshot

Diese abgeleiteten Ergebnisse sind im initialen Modell keine eigenständigen
persistierten Transaktionen.

## Group

Eine Group repräsentiert ein gemeinsames zeitlich begrenztes Vorhaben, für das
Ausgaben zwischen mehreren Participants verwaltet werden.

Beispiele:

- Wochenendtrip
- gemeinsame Veranstaltung
- Geschenk
- vergleichbares gemeinsames Vorhaben

Eine Group besitzt fachlich mindestens:

- einen Namen,
- einen Lifecycle-Status,
- genau einen Owner im MVP,
- eine stabile Participant-Reihenfolge,
- Participants,
- Expenses,
- Settlements.

### Group Ownership

Der Owner ist der App-Zugriff, der die Group verwaltet.

Der Owner muss fachlich nicht zwingend selbst Participant der Group sein.

Damit bleiben zwei unterschiedliche Konzepte erhalten:

Owner
→ darf die Group verwalten

Participant
→ ist finanziell an der Group beteiligt

Soll der Owner selbst an Ausgaben beteiligt sein, existiert für ihn zusätzlich
ein Participant.

### Group Lifecycle

Eine Group ist zunächst aktiv.

Eine aktive Group erlaubt neue fachliche Vorgänge.

Eine Group ohne fachliche Historie darf hart gelöscht werden.

Sobald mindestens eine Expense oder ein Settlement existiert hat, wird die
Group nicht mehr hart gelöscht.

Stattdessen kann sie archiviert werden.

Eine archivierte Group ist read-only:

- sie bleibt lesbar und behält ihre fachliche Historie,
- Participants dürfen nicht erstellt, geändert, deaktiviert oder gelöscht werden,
- Expenses dürfen nicht erstellt, geändert oder gelöscht werden,
- Settlements dürfen nicht erstellt, geändert oder gelöscht werden,
- sonstige finanzielle Mutationen sind ebenfalls nicht erlaubt,
- sie ist für den normalen aktiven Workflow nicht mehr auswählbar.

Der Owner darf die Group reaktivieren. Diese Statusänderung ist die Ausnahme
vom Schreibschutz; danach gelten wieder die normalen Regeln einer aktiven Group.

Der technische Client-, Persistenz- und HTTP-Vertrag ist in
[`group-lifecycle.md`](./group-lifecycle.md) festgelegt.

## Participant

Ein Participant repräsentiert eine Person, die innerhalb genau einer Group
finanziell beteiligt sein kann.

Participant und App User bzw. Access Identity sind unterschiedliche Konzepte.

Ein Participant benötigt:

- keinen Account,
- keine Registrierung,
- keinen eigenen App-Zugriff.

Ein Participant kann insbesondere:

- eine Expense bezahlt haben,
- einen ExpenseShare erhalten,
- Sender eines Settlements sein,
- Empfänger eines Settlements sein,
- Gegenstand eines Statement Snapshots sein.

### Participant Identity

Der fachliche Participant existiert innerhalb seiner Group.

Ein Anzeigename dient der menschlichen Identifikation innerhalb dieser Group.

Der initiale MVP verlangt keine globale Personenidentität.

Zwei Participants mit demselben Namen in unterschiedlichen Groups sind
unabhängige Domain-Objekte.

### Stable Participant Order

Eine Group besitzt eine stabile Reihenfolge ihrer Participants.

Diese Reihenfolge dient insbesondere der deterministischen Verteilung von
Restbeträgen bei Equal Split.

Die fachliche Reihenfolge darf sich nicht allein aus einer zufälligen
technischen Reihenfolge einer Datenbankabfrage ergeben. Sie wird als
`Participant.order` dauerhaft gespeichert, ist innerhalb der Group eindeutig
und bleibt über Reload und Synchronisation stabil.

### Participant Lifecycle

Ein Participant ist zunächst aktiv.

Aktive Participants können für neue fachliche Vorgänge ausgewählt werden.

Ein Participant darf hart gelöscht werden, solange er noch in keiner
fachlichen Transaktion referenziert wurde.

Sobald ein Participant insbesondere in:

- einer Expense als Payer,
- einem ExpenseShare,
- einem Settlement

referenziert wurde, bleibt seine historische Identität erhalten.

Statt eines Hard Delete wird er deaktiviert bzw. archiviert.

Ein inaktiver Participant:

- bleibt in historischen Expenses sichtbar,
- behält bestehende ExpenseShares,
- bleibt in bestehenden Settlements sichtbar,
- bleibt Bestandteil aktueller und historischer Balance-Berechnungen,
- bleibt bei einem Saldo ungleich null Bestandteil der Settlement-Proposal-Berechnung,
- kann nicht für neue Expenses ausgewählt werden,
- darf weiterhin an Settlements teilnehmen, sofern diese dem Ausgleich
  bestehender Salden dienen.

Ein Saldo von null ist keine Voraussetzung für die Deaktivierung.
Eine automatische Reaktivierung findet nicht statt.
Der Schreibschutz einer archivierten Group gilt auch für diese Settlements.

## Access Identity

Eine Access Identity repräsentiert einen App-Zugriff bzw. einen handelnden
Akteur.

Sie ist ausdrücklich nicht dasselbe wie ein Participant.

Für den MVP muss eine Access Identity anonym existieren können.

Die konkrete technische Identifikation erfolgt später.

Dieses Domain-Konzept legt insbesondere nicht fest:

- Cookie,
- Session,
- Token,
- Local Storage,
- Auth Provider,
- Laravel Sanctum,
- Account-Modell.

### MVP Ownership

Im MVP besitzt eine Group genau eine verwaltende Access Identity als Owner.

Damit kann der vollständige MVP-Workflow von einer einzelnen anonymen Person
durchgeführt werden.

### Future Account Linking

Eine Access Identity soll später optional mit einem registrierten Account
verbunden werden können.

Dabei darf die bestehende fachliche Identität nicht verloren gehen.

### Future Participant Access

Ein bestehender Participant kann post-MVP optional mit eigenem App-Zugriff
verbunden werden.

Dabei gilt:

- der bestehende Participant bleibt erhalten,
- die Einladung erzeugt keinen zweiten Participant,
- eine spätere Registrierung erzeugt keinen zweiten Participant,
- Access Identity und Participant bleiben fachlich unterschiedliche Konzepte.

Die konkrete Modellierung von Invitations und Accounts gehört nicht zum
initialen MVP-Domain-Modell.

## Expense

Eine Expense repräsentiert eine gemeinsame Ausgabe innerhalb genau einer Group.

Eine Expense besitzt fachlich mindestens:

- eine Group,
- eine Beschreibung,
- einen positiven Geldbetrag,
- ein relevantes Datum,
- genau einen Payer,
- einen Erfasser bzw. Creator,
- eine Split-Methode,
- mindestens einen ExpenseShare.

### Payer

Der Payer ist ein Participant derselben Group.

Der Payer ist die Person, die die Ausgabe tatsächlich bezahlt hat.

### Creator

Der Creator bezeichnet die Access Identity, die den Datensatz in JoinSplit
erfasst hat.

Damit gilt weiterhin:

Erfasst von ≠ bezahlt von.

Im Single-Owner-MVP werden Expenses durch den Owner erfasst.

Die Unterscheidung bleibt trotzdem fachlich bestehen, weil sie für spätere
kollaborative Nutzung relevant ist.

### Amount

Ein Expense-Betrag:

- ist größer als null,
- wird fachlich in der kleinsten Währungseinheit behandelt,
- wird nicht als binärer Floating-Point-Wert modelliert.

Alle Anteile einer Expense verwenden dieselbe Währung wie die Expense bzw.
deren Group-Kontext.

Mehrwährungslogik gehört nicht zum MVP.

### Split Method

Der MVP kennt ausschließlich:

Equal Split.

Die Split-Methode wird trotzdem als fachliches Konzept betrachtet, weil weitere
Split-Methoden als spätere Produktfunktion ausdrücklich vorgesehen sind.

Es wird im MVP keine abstrakte Strategy-Infrastruktur allein für zukünftige
Split-Methoden eingeführt.

### Expense Invariants

Für jede Expense gilt:

- sie gehört genau einer Group,
- ihr Payer gehört derselben Group,
- sie besitzt mindestens einen ExpenseShare,
- jeder beteiligte Participant kommt höchstens einmal in den Shares vor,
- alle ExpenseShares gehören zu Participants derselben Group,
- die Summe aller ExpenseShares entspricht exakt dem Expense-Betrag.

## ExpenseShare

Ein ExpenseShare repräsentiert den konkreten Geldanteil eines Participants an
einer Expense.

ExpenseShare ist ein persistierbarer fachlicher Bestandteil einer Expense.

Ein ExpenseShare besitzt mindestens:

- die zugehörige Expense,
- den zugehörigen Participant,
- einen Betrag in der kleinsten Währungseinheit.

### Why ExpenseShares Are Explicit

ExpenseShares werden nicht ausschließlich bei jedem Lesen neu aus dem
Expense-Betrag berechnet.

Dadurch bleiben insbesondere:

- Rundungsergebnisse,
- historische Aufteilungen,
- spätere unterschiedliche Split-Methoden

explizit und nachvollziehbar.

### Equal Split Calculation

Für Equal Split wird der Expense-Betrag zunächst gleichmäßig auf alle
ausgewählten Participants verteilt.

Nicht exakt teilbare Restbeträge werden in kleinsten Währungseinheiten nach der
stabilen Participant-Reihenfolge verteilt.

Beispiel:

10,00 € auf drei Participants:

- erster Participant: 3,34 €
- zweiter Participant: 3,33 €
- dritter Participant: 3,33 €

Die Summe beträgt exakt 10,00 €.

### ExpenseShare Invariants

Für einen ExpenseShare gilt:

- er gehört genau einer Expense,
- sein Participant gehört zur selben Group wie die Expense,
- derselbe Participant besitzt innerhalb derselben Expense höchstens einen
  ExpenseShare,
- sein Betrag darf nicht negativ sein.

Ein Share von null kleinsten Währungseinheiten ist fachlich zulässig, falls bei
einem sehr kleinen Expense-Betrag mehr Participants ausgewählt werden als
kleinste Währungseinheiten vorhanden sind.

## Expense Lifecycle

Eine Expense darf im MVP in einer aktiven Group vom berechtigten Actor
bearbeitet oder gelöscht werden.

Bei relevanten Änderungen werden ihre ExpenseShares neu bestimmt.

Dies gilt insbesondere bei Änderung von:

- Gesamtbetrag,
- beteiligten Participants,
- Split-relevanten Daten.

Nach jeder Änderung müssen sämtliche Expense-Invarianten erneut erfüllt sein.

Die Aktualisierung einer Expense und ihrer Shares bildet fachlich eine
zusammenhängende Änderung.

Der MVP benötigt:

- kein vollständiges Expense-Audit-Log,
- keine Versionierung jeder fachlichen Änderung,
- keine historische Speicherung gelöschter Expense-Versionen.

## Settlement

Ein Settlement repräsentiert eine tatsächlich erfolgte Ausgleichszahlung
zwischen zwei Participants.

Ein Settlement ist keine Expense.

Es verändert keine historischen ExpenseShares.

Ein Settlement besitzt fachlich mindestens:

- eine Group,
- einen zahlenden Participant,
- einen empfangenden Participant,
- einen positiven Geldbetrag,
- ein relevantes Datum,
- einen Creator.

Der JS-021-Slice enthält keine Settlement-Notiz. Eine spätere Ergänzung ist
keine Voraussetzung für den MVP-Kernworkflow.

### Settlement Invariants

Für jedes Settlement gilt:

- Sender und Empfänger gehören zur selben Group,
- Sender und Empfänger sind unterschiedliche Participants,
- der Betrag ist größer als null,
- der Betrag wird in der kleinsten Währungseinheit behandelt.

Im MVP wird keine Gegenbestätigung benötigt.

### Settlement Lifecycle

Der Owner darf Settlements im MVP in einer aktiven Group erfassen, bearbeiten
und löschen. Sind beide Participants aktiv, darf jede tatsächlich erfolgte
positive Zahlung erfasst werden. Bei falscher Balance-Richtung oder einer
Überzahlung verlangt die UI zuvor eine ausdrückliche Bestätigung.

Sobald mindestens einer der beiden Participants inaktiv ist, muss das
Settlement einen bestehenden offenen Saldo in der richtigen Richtung
verringern und darf den kleineren der beiden offenen Beträge nicht
überschreiten. Bei einer Bearbeitung wird das bestehende Settlement vor dieser
Prüfung aus der Balance-Berechnung entfernt. Der vollständige Vertrag steht in
[`settlement-contract.md`](settlement-contract.md).

Der MVP benötigt:

- keinen Pending-Status,
- keinen Confirmed-/Rejected-Workflow,
- kein Audit Log,
- keinen Zahlungsbeleg,
- keine Bankintegration.

Post-MVP können zusätzliche Berechtigungsregeln anhand des Creators und der
beteiligten Participants angewendet werden.

## Participant Balance

Ein Participant Balance ist ein abgeleitetes fachliches Ergebnis.

Er wird nicht als eigenständige Zahlung oder Expense behandelt.

Für einen Participant werden berücksichtigt:

- von ihm bezahlte Expense-Beträge,
- ihm zugeordnete ExpenseShares,
- von ihm gesendete Settlements,
- von ihm empfangene Settlements.

Die Vorzeichenkonvention lautet:

positiver Balance
→ Participant soll insgesamt noch Geld erhalten

negativer Balance
→ Participant soll insgesamt noch Geld bezahlen

Balance von null
→ Participant ist ausgeglichen

Konzeptionell:

```text
Balance = bezahlte Expenses
          - eigene ExpenseShares
          + gesendete Settlements
          - empfangene Settlements
```

### Balance Invariants

Für eine konsistente Group gilt:

Die Summe aller Participant Balances beträgt exakt null.

Balance Calculation verwendet ausschließlich exakte Beträge in der kleinsten
Währungseinheit.

Balances werden aus den zugrunde liegenden Domain-Daten berechnet.

Sie sind nicht die primäre Source of Truth.

## Settlement Proposal

Ein Settlement Proposal ist ein abgeleiteter Vorschlag, wie die aktuellen
Balances einer Group ausgeglichen werden können.

Ein Proposal ist:

- keine tatsächlich erfolgte Zahlung,
- kein Settlement,
- keine persistierte finanzielle Transaktion.

Er wird erst dann Teil der Historie, wenn eine reale Zahlung als Settlement
erfasst wird.

### Proposal Inputs

Die Berechnung basiert auf den aktuellen Participant Balances.

Participants mit:

- negativem Balance sind Debtors,
- positivem Balance sind Creditors.

### Settlement Strategies

Der MVP unterstützt zwei fachliche Settlement-Strategien.

#### Deterministic Settlement

Eine einfache deterministische Zuordnung gleicht Debtors und Creditors
schrittweise aus.

Bei gleicher fachlicher Priorität wird die stabile Participant-Reihenfolge als
Tie-Breaker verwendet.

#### Minimum-Transfer Settlement

Alternativ kann ein Settlement Proposal erzeugt werden, das die Anzahl der zur
vollständigen Begleichung erforderlichen Überweisungen global minimiert.

Dabei gilt:

- sämtliche offenen Balances werden vollständig ausgeglichen,
- die Anzahl der vorgeschlagenen Überweisungen ist global minimal,
- bei mehreren gleich optimalen Lösungen wird anhand einer stabilen
  deterministischen Regel genau eine Lösung gewählt,
- ausschließlich positive Geldbeträge in kleinsten Währungseinheiten werden
  verarbeitet.

Die vom Nutzer gewählte Settlement-Strategie verändert ausschließlich den
Proposal und nicht die zugrunde liegenden Balances oder bestehenden
Settlements.

Der einfache Modus verwendet einen stabilen Two-Pointer-Greedy-Algorithmus.
Der Minimum-Transfer-Modus minimiert direkte Debtor-zu-Creditor-Transfers mit
einer exakten solverfreien Bitmask-/Partition-DP. Er ist bis höchstens zwölf
Participants mit Saldo ungleich null verfügbar; oberhalb dieser Grenze wird er
explizit als nicht verfügbar ausgewiesen und nicht still durch Greedy ersetzt.
Tie-Break und kanonische Ausgabe richten sich nach Sender- und Empfänger-
`Participant.order`. Der vollständige Algorithmus- und Testvektorvertrag steht
in [`settlement-proposals.md`](settlement-proposals.md).

### Settlement Proposal Invariants

Ein vollständiger Proposal:

- verändert die Summe der Balances nicht,
- gleicht alle offenen Balances vollständig aus,
- erzeugt keine Zahlung eines Participants an sich selbst,
- erzeugt ausschließlich positive Zahlungsbeträge.

Für identische Domain-Eingaben und dieselbe Settlement-Strategie muss derselbe
Proposal entstehen.

## Statement Snapshot

Ein Statement Snapshot ist eine abgeleitete read-only Darstellung für genau
einen Participant.

Er ist keine neue finanzielle Transaktion.

Der Snapshot wird zur Laufzeit als unveränderlicher Text aus dem aktuellen
Group-Zustand materialisiert. Er besitzt keinen Store, keine API und keine
Historie.

Er enthält mindestens:

- Group-Name,
- Participant,
- relevante ExpenseShares,
- relevante Settlements,
- aktuellen Balance,
- daraus resultierenden Ausgleich, sofern vorhanden.

Der Snapshot repräsentiert den Zustand zum Zeitpunkt seiner Erzeugung, enthält
diesen Erstellungszeitpunkt und weist auf enthaltene noch nicht synchronisierte
Änderungen hin. Spätere Zustandsänderungen verändern bereits erzeugten Text
nicht.

Das Teilen eines Snapshots:

- verändert keine Domain-Daten,
- gewährt keinen Group-Zugriff,
- gewährt keine Bearbeitungsrechte.

## Currency Boundary

Mehrwährungslogik ist kein Bestandteil des MVP.

Innerhalb einer Group müssen alle monetären Werte fachlich derselben Währung
angehören.

Dazu zählen:

- Expenses,
- ExpenseShares,
- Settlements,
- Balances,
- Settlement Proposals.

Umrechnung zwischen verschiedenen Währungen findet nicht statt.

Ob die Währung im MVP fest vorgegeben oder beim Erstellen einer Group
ausgewählt wird, wird separat entschieden.

## Domain Relationships

Konzeptionell:

Group
├── Owner → Access Identity
├── Participants
│   └── optional zukünftiger eigener Access
├── Expenses
│   ├── Payer → Participant
│   ├── Creator → Access Identity
│   └── ExpenseShares
│       └── Participant
└── Settlements
├── Sender → Participant
├── Receiver → Participant
└── Creator → Access Identity

Abgeleitet:

Group + Expenses + ExpenseShares + Settlements
→ Participant Balances

Participant Balances
→ Settlement Proposal

Group + Participant + fachlicher Stand
→ Statement Snapshot

## Aggregate and Consistency Boundaries

Dieses Dokument schreibt noch keine formale DDD-Aggregate-Architektur vor.

Für die fachliche Konsistenz sind jedoch insbesondere folgende Änderungen als
zusammenhängend zu behandeln:

### Group Creation with Initial Participant

Die freigegebene Create-Group-Option kann zusammen mit einer Group einen
separaten aktiven Participant anlegen. Ownership allein erzeugt keinen
Participant und gewährt diesem keinen eigenen App-Zugriff.

Ist die Option ausgewählt, bilden Group und initialer Participant einen
zusammenhängenden Erstellvorgang: beide entstehen vollständig oder keiner von
beiden. Der Participant gehört derselben Group und steht als erster in deren
stabiler Reihenfolge; später hinzugefügte Participants werden angehängt.

Technische Umsetzung, Payload und Retry-Semantik beschreibt der menschlich
freigegebene [Create-Group-Vertrag](create-group-alignment.md).

### Expense Change

Expense und ihre ExpenseShares müssen nach einer Erstellung oder Änderung
gemeinsam wieder einen gültigen Zustand bilden.

Es darf insbesondere kein persistierter Zwischenzustand entstehen, in dem die
Summe der Shares nicht dem Expense-Betrag entspricht.

### Settlement Change

Ein Settlement muss nur als vollständiger gültiger Vorgang bestehen.

Teilweise gültige Settlement-Zustände sind nicht zulässig.

Die konkrete Transaktionssteuerung wird in Laravel später festgelegt.

## Offline Domain Requirements

Offline First ändert die fachlichen Regeln nicht.

Nachdem die Webanwendung geladen wurde, beginnt der MVP-Kernworkflow ohne
Laravel-API-Verbindung mit der Nutzung ohne Account und der Erstellung einer
Group. Ohne Service Worker garantiert der aktuelle Web-Release keinen
erstmaligen oder erneuten Start der App Shell ohne Netzwerkverbindung.
Group repräsentiert weiterhin das gemeinsame Vorhaben bzw. Event.

Der Offline-Umfang umfasst Participant-Verwaltung, das Erstellen, Bearbeiten und
Löschen von Expenses und Settlements, Equal Split, Balance Calculation, beide
Settlement-Proposal-Strategien und die Erzeugung eines Statement Snapshots.
Die Group- und Participant-Lifecycle-Regeln gelten auch offline.
Die externe Weitergabe eines Snapshots kann von Plattform- oder
Netzwerkfähigkeiten abhängen.

Offline erstellte Groups und ihre Fachdaten werden lokal gehalten und mit
Laravel synchronisiert, sobald eine Netzwerkverbindung verfügbar ist.
Nach der Synchronisation bleiben Laravel und PostgreSQL die kanonische
serverseitige Repräsentation.

Access Identity bleibt ein fachlich vom Participant getrenntes Konzept. Die
technische Erzeugung und dauerhafte Speicherung in IndexedDB sind inzwischen in
[`anonymous-access.md`](anonymous-access.md) und
[`local-persistence.md`](local-persistence.md) festgelegt.

Die offline ausgeführte TypeScript-Domainlogik und die serverseitige
PHP-Domainlogik müssen insbesondere für:

- Equal Split,
- Balance Calculation,
- Settlement Proposal

dieselben Ergebnisse produzieren.

Dies gilt für beide Settlement-Strategien.

Dafür werden gemeinsame fachliche Beispielszenarien bzw. Testvektoren
definiert.

Offline-spezifische technische Konzepte wie:

- Pending Mutation,
- Outbox Entry,
- Sync Status,
- Server Version

gehören nicht zum fachlichen Domain-Modell dieses Dokuments.

Sie werden in der späteren Sync-Architektur modelliert.

## Core Invariants Summary

Für den initialen Domain-Kern gelten insbesondere:

1. Ein Participant gehört genau einer Group.
2. Participant und Access Identity sind unterschiedliche Konzepte.
3. Der Group Owner muss nicht zwingend selbst Participant sein.
4. Ein Expense gehört genau einer Group.
5. Der Payer einer Expense ist Participant derselben Group.
6. Eine Expense besitzt mindestens einen ExpenseShare.
7. Ein Participant besitzt pro Expense höchstens einen ExpenseShare.
8. Die Summe aller ExpenseShares entspricht exakt dem Expense-Betrag.
9. Persistierte Geldwerte verwenden keine binären Floating-Point-Typen.
10. Equal-Split-Restbeträge werden deterministisch verteilt.
11. Sender und Empfänger eines Settlements sind unterschiedlich.
12. Beide Settlement-Participants gehören zur selben Group.
13. Die Summe aller Participant Balances einer konsistenten Group ist null.
14. Settlement Proposals sind Vorschläge und keine tatsächlichen Settlements.
15. Die gewählte Settlement-Strategie verändert weder Balances noch bereits
    erfasste Settlements.
16. Minimum-Transfer Settlement minimiert die Anzahl erforderlicher
    Überweisungen global.
17. Für identische Eingaben und dieselbe Settlement-Strategie entsteht derselbe
    Proposal.
18. Historisch verwendete Participants werden nicht hart gelöscht.
19. Groups mit fachlicher Historie werden nicht hart gelöscht.
20. Archivierte Groups sind read-only; der Owner darf sie reaktivieren.
21. Offline- und Server-Domainlogik müssen für dieselben Inputs dieselben
    fachlichen Ergebnisse liefern.

## Explicitly Not Decided Here

Dieses Dokument legt bewusst noch nicht fest:

- konkrete Datenbanktabellen,
- Primärschlüsseltypen,
- UUID vs. andere Identifikatoren,
- Eloquent-Beziehungen,
- Laravel Service- oder Action-Klassen,
- API-Endpunkte,
- Request- und Response-Strukturen,
- konkrete Account-Entität,
- Invitation-Entität,
- Authentifizierungsmechanismus,
- Session- oder Token-Technik,
- lokale Client-Datenbank,
- Sync-Metadaten,
- Versionierungsstrategie für Offline-Sync,
- Konfliktauflösungsalgorithmus für Sync,
- weitere Settlement-Proposal-Strategien,
- konkrete Währung des MVP,
- konkrete Statement-Ausgabeform,
- zusätzliche Split-Methoden.

Diese Entscheidungen werden in nachfolgenden Architecture- und Delivery-Tasks
nur dann getroffen, wenn sie für einen konkreten Use Case benötigt werden.
