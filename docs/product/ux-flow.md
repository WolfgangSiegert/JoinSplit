# JoinSplit – MVP UX Flow

## Status and Purpose

JS-009 definiert die freigegebene MVP User Journey und die minimale mobile
View- und Navigationsstruktur für JoinSplit.

Das Dokument beschreibt:

- die fachliche Main Journey,
- relevante Neben-, Fehler- und Offline-Pfade,
- die minimal notwendigen Ansichten,
- sichtbare Zustände und ihre Auswirkungen auf die Bedienung,
- bestätigte UX-Entscheidungen.

Es definiert kein finales Visual Design und keine technische Sync-Architektur.

Editierbare Visualisierungen:

- [MVP User Journey v3](https://www.figma.com/board/WejFzvlAIOJedtlkp0ULHp?node-id=16-459)
- [View and Navigation Map v3](https://www.figma.com/board/WejFzvlAIOJedtlkp0ULHp?node-id=17-565)

Die fachlichen Regeln aus `docs/product/mvp.md`,
`docs/architecture/domain-model.md` und
`docs/architecture/anonymous-access.md` bleiben maßgeblich.

## JS-010 Wireframes and Handoff

- [MVP Low-Fi Wireframes, Phasen A–F](https://www.figma.com/design/jaNwaunORIBGyWUC980dla)
- [Abschlussprüfung und UX-Übergabe für JS-011](wireframes/js-010/2026-09-14/review.md)
- [Lokale Sicherung und lesbare Exporte](wireframes/js-010/2026-09-14/README.md)

Der korrigierte Gesamtstand vom 2026-09-14 einschließlich Phasen A–F,
ergänzender Zustände und UX-Übergabe wurde am 2026-09-14 ausdrücklich
menschlich freigegeben. JS-010 ist fachlich abgeschlossen und laut dem vom
Nutzer übermittelten Worker-Bericht im GitHub Project Done; JS-011 bleibt Todo.
Diese Statusangaben wurden hier nicht eigenständig live verifiziert.
Die Wireframes sind statisch, kein interaktiver Prototyp.

Der [Create-Group-Vertrag](../architecture/create-group-alignment.md) wurde am
2026-09-14 ausdrücklich menschlich freigegeben. Der Architekturabgleich für
Group plus optionalen Participant, gemeinsamen Erfolg und duplikatfreien Retry
ist dokumentarisch abgeschlossen. Die damalige M1-Grenze blieb Arbeitsspeicher;
seit M2 werden Access Identity und Fachdaten dauerhaft in IndexedDB gespeichert.

## Main Journey

Der typische MVP-Ablauf ist:

1. **Gruppe starten**
   - Der App User beginnt ohne Anmeldung.
   - Er gibt einen Gruppennamen ein.
   - Die sichtbare, standardmäßig aktivierte Option „Mich als Teilnehmer
     hinzufügen“ erlaubt ihm, zusammen mit der Group einen separaten
     Participant für sich anzulegen.
   - Ist die Option aktiviert, gibt er den Namen dieses Participants an.
   - Die Group ist sofort lokal nutzbar.
2. **Participants hinzufügen**
   - Der Owner ergänzt und verwaltet die finanziell beteiligten Personen.
   - Hat er sich bei der Group-Erstellung nicht als Participant hinzugefügt,
     kann er dies weiterhin ausdrücklich über die Participant-Verwaltung tun.
3. **Expense erfassen**
   - Der Owner gibt Betrag, Datum und Payer an.
   - Er wählt die beteiligten Participants.
   - JoinSplit zeigt den Equal Split und die konkreten ExpenseShares vor dem
     Speichern.
4. **Balances verstehen**
   - Der Owner erkennt, wer noch Geld erhält, wer noch zahlen muss und wer
     ausgeglichen ist.
   - Die zugrunde liegenden Expenses, ExpenseShares und Settlements bleiben
     nachvollziehbar.
5. **Settlement Proposal ansehen**
   - Der Owner wählt zwischen einfachem deterministischem Ausgleich und der
     globalen Minimierung der Anzahl erforderlicher Überweisungen.
   - Ein Proposal ist noch keine tatsächliche Zahlung und verändert keine
     Domain-Daten.
6. **Erfolgte Zahlung dokumentieren**
   - Nach einer außerhalb von JoinSplit erfolgten Zahlung erfasst der Owner ein
     Settlement mit Sender, Empfänger, Betrag und Datum.
   - Balances und daraus abgeleitete Proposals werden aktualisiert.
7. **Statement Snapshot teilen**
   - Der Owner erzeugt für genau einen Participant einen statischen Snapshot.
   - Er prüft Stand und Erstellungszeitpunkt und kopiert oder teilt den Text.

Expense-Erfassung und Prüfung des aktuellen Stands können sich beliebig oft
wiederholen. Ein Statement Snapshot kann bereits ab dem ersten berechneten
Participant Balance erzeugt werden und setzt kein Settlement voraus.

## Core Concepts and Visible States

### Group and Access

Owner-Zugriff und finanzielle Beteiligung sind getrennt:

- Der Group Owner ist eine Access Identity.
- Ownership allein erzeugt keinen Participant und macht den Owner nicht
  automatisch zu einem Participant.
- Die Create-Group-Option kann auf ausdrückliche, sichtbare Auswahl hin einen
  separaten Participant für den Owner erzeugen. Access Identity und Participant
  bleiben dabei unterschiedliche Konzepte.
- Eine Group ist aktiv oder archiviert.
- Eine aktive Group erlaubt die fachlichen MVP-Mutationen.
- Eine archivierte Group bleibt read-only; der Owner darf sie reaktivieren.

### Participant

- Ein Participant ist aktiv oder inaktiv.
- Inaktive Participants bleiben in Historie und Balance sichtbar.
- Sie stehen für neue Expenses nicht zur Auswahl.
- Bei offenem Balance können sie weiterhin an Settlements zum Ausgleich dieses
  Balance beteiligt sein.
- Eine Reaktivierung erfolgt nur durch eine ausdrückliche Aktion.

### Expense and ExpenseShare

- Der MVP verwendet ausschließlich Equal Split.
- Die konkreten ExpenseShares werden vor dem Speichern sichtbar gemacht.
- Rest-Cents werden nach der stabilen Participant-Reihenfolge deterministisch
  verteilt.
- Änderungen an Betrag oder beteiligten Participants bestimmen die Shares neu.

### Participant Balance and Settlement Proposal

- Balances und Proposals sind berechnete Ergebnisse.
- Ein positiver Balance bedeutet, dass der Participant Geld erhalten soll.
- Ein negativer Balance bedeutet, dass der Participant Geld zahlen soll.
- Ein Balance von null bedeutet, dass der Participant ausgeglichen ist.
- Der Strategiewechsel verändert nur den Proposal.

### Settlement

- Ein Settlement dokumentiert eine tatsächlich erfolgte Zahlung.
- Es besitzt im MVP keinen Pending-, Confirmation- oder Rejection-Status.
- Ein ausstehender Sync ist nicht dasselbe wie eine noch nicht erfolgte
  Zahlung.

### Statement Snapshot

- Ein Snapshot ist statisch und read-only.
- Er stellt den Stand zu seinem Erstellungszeitpunkt dar.
- Er gewährt weder Group-Zugriff noch Bearbeitungsrechte.

## Minimal Mobile Views and Navigation

### Group Overview

Die Group Overview zeigt aktive Groups und ermöglicht den Zugriff auf
archivierte Groups über einen Filter. Von hier wird eine bestehende Group
geöffnet oder eine neue erstellt.

### Create Group

Die Ansicht enthält den Group-Namen und weist die feste MVP-Währung EUR aus.
Sie enthält außerdem die Checkbox „Mich als Teilnehmer hinzufügen“. Ihr Wert
wird aus der gruppenübergreifenden App-Einstellung vorbelegt und bleibt für die
konkrete Group-Erstellung überschreibbar. Der anfängliche Standardwert der
App-Einstellung ist `true`.

Ist die Checkbox aktiviert, wird das sichtbare Pflichtfeld „Mein Name in dieser
Gruppe“ eingeblendet. Beim Erstellen entsteht zusätzlich zur Group ein normaler
Participant mit diesem Namen. Die Owner Access Identity und dieser Participant
werden dadurch nicht zu derselben Entität.

Nach dem lokalen Erstellen öffnet sich die leere Expense-Ansicht der Group.

### Global Settings

Die App bietet eine globale Einstellung „Bei neuen Gruppen standardmäßig als
Teilnehmer hinzufügen“. Sie gilt gruppenübergreifend für den anonymen App User
und ist anfänglich aktiviert. Sie verändert nur die Vorbelegung der sichtbaren
Create-Group-Checkbox; der Nutzer kann diese bei jeder Group-Erstellung ändern.

Die globale Einstellung zur Settlement-Proposal-Strategie wird ebenfalls in
diesem App-Kontext angeboten. Sie ist gerätelokal in IndexedDB gespeichert,
verwendet standardmäßig den einfachen deterministischen Ausgleich und erzeugt
weder einen API-Aufruf noch eine Pending Mutation.

### Three Group Areas

Innerhalb einer Group sind drei gleichbleibende Bereiche direkt erreichbar:

1. **Expenses**
   - Expense-Liste
   - Expense hinzufügen
2. **Balances and Settlement**
   - Balances pro Participant
   - Settlement-Proposal-Strategie
   - vorgeschlagene Transfers
   - erfasste Settlements
3. **Participants**
   - aktive und inaktive Participants
   - Participant hinzufügen und verwalten

### Detail Views

- **Expense:** anlegen, lesen und bearbeiten; Löschen nach Bestätigung.
- **Settlement:** tatsächlich erfolgte Zahlung erfassen, lesen und bearbeiten;
  Löschen nach Bestätigung.
- **Participant Financial State:** Balance anhand relevanter Expenses,
  ExpenseShares und Settlements nachvollziehen.
- **Statement Preview:** statischen Participant Snapshot prüfen, kopieren oder
  teilen.

Participant-Formulare, Group-Verwaltung, Strategieauswahl, Löschbestätigungen
und Sync-Details bleiben im jeweiligen Kontext und erzeugen keine zusätzlichen
Hauptansichten.

## Alternate and Lifecycle Paths

- Fehlt beim Erfassen einer Expense ein Participant, kann er im Kontext
  ergänzt werden. Der Expense-Entwurf bleibt erhalten.
- Änderungen oder Löschungen von Expenses und Settlements aktualisieren
  Balances und Proposals unmittelbar.
- Ein Participant ohne fachliche Referenz darf gelöscht werden. Andernfalls
  wird er deaktiviert.
- Eine Group ohne jemals vorhandene Expense- oder Settlement-Historie darf
  gelöscht werden. Andernfalls wird sie archiviert.
- Eine Group darf auch mit offenen Balances oder ausstehenden Sync-Vorgängen
  archiviert werden. Diese Zustände werden vor der Bestätigung genannt.
- Eine archivierte Group zeigt weiterhin ihren fachlichen Stand und erlaubt die
  Snapshot-Erzeugung. Fachliche Änderungen erfordern zuvor eine Reaktivierung.
- Teilzahlungen und vom Proposal abweichende Settlements können manuell erfasst
  werden. Sind beide Participants aktiv, erfordern falsche Balance-Richtung und
  Überzahlung eine ausdrückliche Bestätigung. Sobald ein Participant inaktiv
  ist, darf die Zahlung nur einen offenen Saldo in korrekter Richtung und
  höchstens bis zu dessen kleinerem offenen Betrag reduzieren.
- Sind alle Balances null, zeigt die Oberfläche einen verständlichen
  ausgeglichenen Zustand statt leerer oder Null-Euro-Proposals.

## Offline and Sync Experience

Offline ist kein separater Flow. Der fachliche Kernworkflow bleibt lokal
verfügbar und wartet nicht auf das Netzwerk.

Connectivity und Synchronisation werden als getrennte Zustände dargestellt:

- **Offline:** Der lokal vorhandene Stand bleibt nutzbar.
- **Sync ausstehend:** Die Änderung ist lokal gespeichert, aber noch nicht vom
  Server bestätigt.
- **Synchronisierung läuft:** Der Vorgang blockiert den Kernworkflow nicht.
- **Synchronisiert:** Der Server hat den Stand bestätigt.
- **Sync fehlgeschlagen:** Lokale Änderungen bleiben erhalten; ein temporärer
  Fehler kann erneut versucht werden.
- **M4-Ziel – nur lokal, Serversynchronisierung beendet:** Die lokale Group bleibt
  nutzbar, ihre zeitlich begrenzte Serverkopie existiert nicht mehr. Dieser
  Zustand ist terminal: Es gibt weder Endlos-Retries noch eine automatische
  Rekonstruktion der Serverkopie.
- **Abgelehnt oder Konflikt:** Der betroffene Vorgang und der bekannte Grund
  werden verständlich angezeigt. Die konkrete Korrekturaktion folgt der noch zu
  definierenden Konfliktregel.

Scheitert bereits das lokale Speichern, darf kein Erfolg gemeldet werden. Der
Formularinhalt bleibt zur Korrektur oder Wiederholung erhalten.

Snapshots zeigen ihren Erstellungszeitpunkt und weisen gegebenenfalls auf noch
nicht synchronisierte enthaltene Änderungen hin. Ein erzeugter Snapshot bleibt
statisch.

Die historische M1-Grenze hielt Access Identity und Credential nur im
Arbeitsspeicher. Seit M2 liegen beide dauerhaft in IndexedDB. Das schützt nicht
vor Löschen oder Verlust des Browserprofils. Seit M5 kann ein optionaler Account
autorisierte Daten auf einem anderen Gerät rehydrieren; eine Backup- oder
Recovery-Zusage entsteht dadurch nicht.

Vor der ersten Dateneingabe erscheint die in M4 eingeführte
Testdatenwarnung. Ein sichtbarer Link erklärt Single Owner, Browserbindung,
Recovery-, Offline- und Aufbewahrungsgrenzen. Seit M6 kann eine bereits unter
Service-Worker-Kontrolle geladene Ansicht aus dem begrenzten App-Shell-Cache
offline neu starten; Erstaufruf und ungesehene Routen bleiben netzabhängig. Ein
ausdrücklich lokaler Reset warnt vor dem Verlust aller Browserdaten und
ausstehenden Änderungen. Er entfernt IndexedDB und Credential, löscht aber
keine synchronisierte Serverkopie und darf dies auch nicht behaupten.

Die App-Installation bleibt eine progressive Ergänzung: Eine direkte Aktion
erscheint nur, wenn der Browser einen nativen Installationsdialog anbietet.
Andernfalls erklären die Einstellungen knapp den manuellen Browserweg, ohne
eine erfolgte Installation zu behaupten. Eine neue App-Version wird sichtbar
angeboten und nie still neu geladen. Bei ausstehenden lokalen Änderungen nennt
der Dialog deren Anzahl und lässt wahlweise zuerst synchronisieren, die aktuelle
Version weiterverwenden oder das lokale Risiko ausdrücklich akzeptieren.
IndexedDB wird durch eine App-Aktualisierung nicht gelöscht.

## Confirmed UX Decisions

- Die MVP-Währung ist EUR und wird sichtbar ausgewiesen.
- Create Group zeigt die Checkbox „Mich als Teilnehmer hinzufügen“.
- Die Checkbox ist über eine gruppenübergreifende App-Einstellung vorbelegt,
  bei jeder Group-Erstellung überschreibbar und anfänglich aktiviert.
- Bei aktivierter Checkbox ist „Mein Name in dieser Gruppe“ erforderlich. Beim
  Erstellen wird ein separater Participant angelegt; Access Identity und
  Participant bleiben getrennt.
- Der einfache deterministische Ausgleich ist die Standardstrategie.
- Die Strategieauswahl befindet sich bei den Proposals. Sie wird als
  gruppenübergreifende, gerätelokale Einstellung des anonymen App Users in
  IndexedDB gespeichert. Sie wird nicht mit dem Server synchronisiert.
- Statement Snapshots werden zunächst als lesbarer Text erzeugt. Der Text ist
  kopierbar und kann bei Plattformunterstützung über System Sharing geteilt
  werden. Er enthält den Erstellungszeitpunkt und gegebenenfalls einen Hinweis
  auf enthaltene ausstehende Änderungen; es gibt keinen Snapshot-Store, keine
  API und keine Historie.
- Neue Expenses wählen zunächst alle aktiven Participants aus. Auswahl und
  konkrete Shares bleiben vor dem Speichern sichtbar.
- Der Payer wird ausdrücklich gewählt und nicht aus dem Owner abgeleitet.
- Inaktive Participants werden für neue Expenses nicht angeboten.
- Gleiche Participant-Namen innerhalb einer Group lösen eine Warnung aus.
- Teilzahlungen werden unterstützt.
- Archivierung ist auch bei offenen Balances oder ausstehendem Sync möglich.

## Avoided Screens and Flows

Der MVP enthält insbesondere keine:

- Login- oder Guest-Mode-Auswahl vor der Group-Erstellung,
- verpflichtende Setup Journey,
- eigene Split-Methoden-Auswahl,
- zusätzlichen Dashboard-Screen,
- getrennten Screens pro Settlement-Proposal-Strategie,
- Zahlungsfreigabe oder Gegenbestätigung,
- Sync-Center als Pflichtstation,
- manuelle Conflict-Merge-Oberfläche,
- Snapshot-Historie,
- Participation Invitation im Statement-Flow,
- Erfolgsseite nach jeder Mutation.

## Accessibility Requirements for the Flow

- Alle Aktionen sind per Tastatur erreichbar und besitzen einen sichtbaren
  Fokus.
- Die Fokusreihenfolge folgt der visuellen und fachlichen Reihenfolge.
- Nach einem Dialog kehrt der Fokus zum auslösenden Element zurück.
- Form Controls besitzen sichtbare Labels und verständliche Fehlermeldungen.
- Die abhängige Eingabe „Mein Name in dieser Gruppe“ wird bei Änderung der
  Owner-Participant-Checkbox programmatisch und visuell nachvollziehbar ein-
  oder ausgeblendet; bei Einblendung folgt sie unmittelbar auf die Checkbox.
- Eingaben bleiben nach Validation-, Speicher- oder Sync-Fehlern erhalten.
- Balance-, Lifecycle- und Sync-Zustände werden textlich vermittelt und nicht
  allein durch Farbe, Symbol oder Vorzeichen.
- Dynamische Statusänderungen sind für Screenreader wahrnehmbar, ohne
  unwichtige Hintergrundaktualisierungen störend anzukündigen.
- Kritische Löschaktionen nennen das konkrete Objekt und verlangen eine
  Bestätigung.
- Der Flow bleibt bei Zoom, Reflow, Touch- und schmaler mobiler Darstellung
  bedienbar.

Diese Anforderungen dienen der Planung in Richtung WCAG 2.2 Level AA. Eine
Konformitätsaussage erfordert eine spätere Prüfung der Implementierung.

## Open Product and Architecture Questions

Folgende Punkte wurden durch JS-009 nicht entschieden:

- Bearbeitung historischer Expenses mit inzwischen inaktiven Participants,
- Offline-Bereitstellung der App Shell,
- Versionierung und Konfliktbehandlung beim Sync,
- serverseitige Speicherung gerätelokaler Einstellungen; sie ist für den MVP
  nicht vorgesehen.

Die Create-Group-Architektur einschließlich Namensvalidation, optionalem
Participant, lokalem Erfolg und Retry ist im freigegebenen Vertrag konkretisiert.
Die dauerhafte lokale Persistenz wurde mit M2 entschieden. Die M4-Grenzen für
öffentliche Demo, Retention und lokalen Reset stehen im
[Portfolio-Demo-Vertrag](portfolio-demo.md). Die übrigen Fragen blockierten den
begrenzten M1 Create-Group-Slice nicht.
