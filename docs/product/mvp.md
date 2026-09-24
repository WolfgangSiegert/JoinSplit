# JoinSplit – MVP Scope and Non-Goals

## Purpose

Dieses Dokument definiert den fachlichen Umfang des ersten JoinSplit-MVP.

Es legt fest:

- welche Fähigkeiten für den ersten brauchbaren Produktstand erforderlich sind,
- welche Funktionen bewusst auf später verschoben werden,
- welche Themen ausdrücklich kein Ziel des MVP sind.

Das Dokument beschreibt Produktumfang und fachliche Grenzen.

Konkrete technische Architektur, Datenmodelle, API-Design,
Authentifizierungsmechanismen und Implementierungsdetails werden in separaten
Engineering- und Architecture-Tasks festgelegt.

## MVP Goal

Der erste JoinSplit-MVP soll den vollständigen Kernworkflow für eine kleine
Gruppe ermöglichen, die von einer einzelnen Person verwaltet wird.

Der Nutzer soll JoinSplit ohne vorherige Registrierung verwenden können und in
der Lage sein:

- eine Gruppe anzulegen,
- Participants zu verwalten,
- gemeinsame Ausgaben zu erfassen,
- Kosten gleichmäßig aufzuteilen,
- den aktuellen finanziellen Stand zu verstehen,
- Ausgleichszahlungen abzuleiten,
- tatsächlich erfolgte Settlements zu dokumentieren,
- einen verständlichen Statement Snapshot zu teilen.

Der Kernworkflow muss nach dem Laden der Webanwendung ohne Verbindung zur
Laravel-API nutzbar sein, einschließlich der Nutzung ohne Account und der
Gruppenerstellung. Der aktuelle MVP garantiert ohne Service Worker weder den
erstmaligen Aufruf noch einen erneuten Start der Webanwendung ohne
Netzwerkverbindung. Der Abschnitt Offline-First Scope definiert den
verbindlichen fachlichen Offline-Umfang.

## MVP Usage Model

Der MVP verwendet bewusst ein Single-Owner-Modell.

Eine einzelne Person verwaltet die Gruppe und ihre Participants.

Participants benötigen:

- keinen JoinSplit-Account,
- keine Registrierung,
- keinen eigenen App-Zugriff.

Participation Invitations und kollaborativer Mehrbenutzerzugriff gehören nicht
zum MVP.

Die grundlegende Nutzung von JoinSplit ist accountless-first. „Ohne Account“
bedeutet nicht, dass eingegebene Namen und Finanzdaten anonym sind.

Offline erstellte Daten werden zunächst lokal gehalten. Nach der Synchronisation
bleiben Laravel und PostgreSQL die kanonische serverseitige Repräsentation der
gemeinsamen Daten. Für den noch zu implementierenden M4-Portfolio-Release gilt
dies innerhalb seiner aktiven serverseitigen Aufbewahrungsperiode. Die
zeitlich begrenzte Demo ist im
[Portfolio-Demo-Vertrag](portfolio-demo.md) separat definiert.

## Included Capabilities

### Group Management

Der Nutzer kann:

- eine Gruppe erstellen,
- den relevanten Gruppenstand öffnen,
- die für den Kernworkflow notwendigen Gruppendaten verwalten.

Der Ersteller ist im MVP der Owner der Gruppe.

### Participant Management

Der Owner kann Participants hinzufügen und verwalten.

Participants können vollständig an Ausgaben, Aufteilungen, Salden und
Settlements beteiligt sein, ohne JoinSplit selbst zu verwenden.

### Expense Management

Der Owner kann gemeinsame Ausgaben:

- erfassen,
- bearbeiten,
- löschen.

Für eine Ausgabe muss mindestens nachvollziehbar sein:

- wofür die Ausgabe entstanden ist,
- wer bezahlt hat,
- welche Participants beteiligt sind,
- wie der Betrag aufgeteilt wurde.

### Equal Split

Der MVP unterstützt ausschließlich eine gleichmäßige Aufteilung auf frei
auswählbare Participants einer Ausgabe.

Beispiel:

Eine Ausgabe von 120,00 € wird auf vier ausgewählte Participants verteilt.

Jeder Participant erhält einen Anteil von 30,00 €.

Weitere Split-Methoden sind nicht Bestandteil des MVP.

### Rounding

Geldbeträge werden fachlich in der kleinsten Währungseinheit behandelt.

Kann ein Betrag bei Equal Split nicht exakt verteilt werden, werden
verbleibende kleinste Währungseinheiten deterministisch nach einer stabilen
Participant-Reihenfolge verteilt.

Beispiel:

10,00 € auf drei Participants:

- 3,34 €
- 3,33 €
- 3,33 €

Die Summe aller Anteile muss immer exakt dem ursprünglichen Ausgabenbetrag
entsprechen.

### Expense and Balance Transparency

Der Nutzer kann jederzeit nachvollziehen:

- welche Ausgaben erfasst wurden,
- welche Participants beteiligt sind,
- welche Anteile daraus entstehen,
- welche Zahlungen bereits berücksichtigt wurden,
- welche aktuellen Salden daraus resultieren.

JoinSplit soll damit bereits vor dem Settlement Transparenz schaffen.

### Settlement Proposal

JoinSplit kann aus Ausgaben, Aufteilungen und bereits erfassten Settlements
ableiten, welche Zahlungen zwischen Participants offene Salden ausgleichen
würden.

Der MVP unterstützt zwei auswählbare Settlement-Strategien:

- einen einfachen deterministischen Ausgleich,
- eine globale Minimierung der Anzahl erforderlicher Überweisungen.

Die gewählte Strategie ist eine User-Einstellung.

Die gewählte Strategie beeinflusst ausschließlich den erzeugten Settlement
Proposal und verändert weder die zugrunde liegenden Balances noch bereits
erfasste Settlements.

Beide Strategien müssen für dieselben fachlichen Ausgangsdaten deterministische
Ergebnisse liefern.

Die konkrete algorithmische Umsetzung ist im
[`Settlement Proposal Algorithms`-Vertrag](../architecture/settlement-proposals.md)
definiert.

### Settlement Recording

Der Owner kann eine tatsächlich erfolgte Ausgleichszahlung zwischen zwei
Participants erfassen.

Ein Settlement enthält fachlich mindestens:

- zahlenden Participant,
- empfangenden Participant,
- Betrag,
- relevantes Datum.

Der JS-021-Slice enthält keine Settlement-Notiz.

Erfasste Settlements beeinflussen unmittelbar:

- die aktuellen Salden,
- daraus abgeleitete Ausgleichsvorschläge.

Der MVP benötigt keine Gegenbestätigung der beteiligten Participants.

### Statement Snapshot

Der Owner kann für einen Participant einen statischen, read-only Statement
Snapshot des aktuellen Stands erzeugen und teilen.

Der Snapshot enthält mindestens:

- Gruppenname,
- Participant,
- relevante Ausgabenanteile,
- berücksichtigte Settlements,
- aktuellen Saldo,
- daraus resultierenden Ausgleich, sofern vorhanden.

Ein Statement Snapshot:

- repräsentiert den Stand zum Zeitpunkt seiner Erstellung,
- gewährt keinen Zugriff auf die Gruppe,
- gewährt keine Bearbeitungsrechte,
- setzt keinen JoinSplit-Account voraus.

Der MVP benötigt lediglich eine einfache Möglichkeit, diesen Snapshot
weiterzugeben.

Konkrete Export- und Share-Formate werden separat entschieden.

## Offline-First Scope

Offline First ist Bestandteil des MVP.

Der Offline-First-Scope ist bewusst auf den Single-Owner-Kernworkflow begrenzt.

### Offline verfügbar

Die folgende Liste definiert den verbindlichen fachlichen Offline-Umfang des
MVP. Eine Verbindung zur Laravel-API oder eine zuvor serverseitig verfügbare
Group ist dafür nicht erforderlich. Nachdem die Webanwendung geladen wurde,
muss der Nutzer ohne API-Verbindung:

- JoinSplit ohne Account nutzen können,
- eine Gruppe erstellen und lokal vorhandene Gruppen öffnen können,
- Participants hinzufügen, ändern, deaktivieren und im Rahmen der
  Lifecycle-Regeln entfernen können,
- Ausgaben erstellen, ändern und löschen können,
- Equal Split durchführen können,
- Settlements erfassen, ändern und löschen können,
- den lokal verfügbaren Gruppenstand sehen können,
- Salden berechnen können,
- beide Settlement-Proposal-Strategien berechnen können,
- einen Statement Snapshot erzeugen können.

Dabei gelten die Group- und Participant-Lifecycle-Regeln des Domain-Modells
auch offline.

Die externe Weitergabe eines Statement Snapshots kann von Plattform- oder
Netzwerkfähigkeiten abhängen. Die Snapshot-Erzeugung selbst muss offline
funktionieren.

### Synchronisation

Offline erstellte Groups und ihre Fachdaten sowie weitere lokale Änderungen
werden lokal gehalten und mit dem Laravel-Backend synchronisiert, sobald eine
Netzwerkverbindung verfügbar ist. Dies setzt keine frühere API-Verbindung
voraus. Nach der Synchronisation bleiben Laravel und PostgreSQL die kanonische
serverseitige Repräsentation. Der noch zu implementierende M4-Portfolio-Release
begrenzt diese Repräsentation durch seinen separaten Aufbewahrungsvertrag.

Der Nutzer soll erkennen können, wenn:

- lokale Änderungen noch nicht synchronisiert wurden,
- eine Synchronisierung aussteht oder fehlschlägt.

### Offline-First Boundaries

Der MVP benötigt ausdrücklich keine:

- komplexe kollaborative Offline-Synchronisation,
- ausgefeilte Multi-Device-Konfliktauflösung,
- manuelle Conflict-Merge-Oberfläche,
- Offline-Participation-Invitations,
- Offline-Account- oder Registrierungsflows,
- komplexe Background-Sync-Infrastruktur als eigenständiges Produktfeature.

Die konkrete lokale Datenhaltung, Sync-Strategie und Konfliktregel sind
Architekturentscheidungen und werden nicht in diesem Dokument festgelegt.

## Post-MVP Commitments

Die folgenden Funktionen gehören bewusst nicht zum ersten MVP, sind aber als
spätere Produktentwicklung vorgesehen.

### Participation Invitations and Collaboration

Später soll ein bestehender Participant eigenen Zugriff auf JoinSplit erhalten
können.

Dazu gehören:

- Participation Invitations,
- anonymer eigener Participant-Zugriff,
- kollaborative Gruppenverwaltung innerhalb der bereits definierten
  Berechtigungsregeln.

### Optional Accounts

JoinSplit soll später optionale registrierte Accounts unterstützen.

Eine Registrierung soll bestehende anonyme Nutzung übernehmen können, ohne
Participants oder Gruppenmitgliedschaften zu duplizieren.

### Additional Split Methods

Weitere Split-Methoden sollen später ergänzt werden.

Dazu können insbesondere gehören:

- exakte individuelle Beträge,
- prozentuale Aufteilung,
- gewichtete Anteile.

Konkreter Umfang, Priorisierung und UX werden später festgelegt.

### Additional Statement Sharing Options

Statement Sharing soll später über den einfachen MVP-Snapshot hinaus erweitert
werden.

Dazu können insbesondere gehören:

- PDF-Export,
- Bild- oder grafischer Export,
- read-only Live Statements,
- gegebenenfalls Snapshot-Historie,
- weitere Share-Ziele oder Formate.

Konkrete Priorisierung und technische Umsetzung werden später entschieden.

### PWA Distribution

JoinSplit soll langfristig als PWA auslieferbar sein.

Offline First im MVP bedeutet nicht automatisch, dass bereits der vollständige
PWA-Installations- und Distributionsumfang umgesetzt werden muss. Insbesondere
garantiert der aktuelle Web-Release ohne Service Worker keinen Offline-Start der
App Shell.

### Native Distribution

JoinSplit soll später mit derselben Frontend-Codebasis als native iOS- und
Android-App ausgeliefert werden können.

Capacitor ist dafür derzeit die bevorzugte Richtung.

Capacitor und native Plattformprojekte sind nicht Bestandteil des MVP.

## Explicit MVP Non-Goals

Die folgenden Themen sind für den ersten MVP ausdrücklich kein Ziel:

- Bank- oder Payment-Integration,
- automatische Zahlungsausführung,
- Budgets,
- komplexe Analytics oder Reporting-Funktionen,
- wiederkehrende Ausgaben,
- Mehrwährungslogik,
- komplexe Rollen- und Berechtigungsmodelle,
- Notification-System,
- komplexer Settlement-Bestätigungsworkflow,
- Beleg- oder Attachment-Management,
- dauerhafte Haushalts- oder Budgetmanagement-Optimierung.

Diese Punkte sind nicht automatisch spätere Commitments.

Sie können nur durch einen später bestätigten Produktbedarf in den Scope
aufgenommen werden.

## Product Constraints

Aus dem MVP-Scope ergeben sich folgende fachliche Leitplanken:

- Der MVP muss ohne Registrierung nutzbar sein.
- Eine einzelne Person muss den vollständigen Kernworkflow verwalten können.
- Participants dürfen existieren, ohne selbst JoinSplit-Nutzer zu sein.
- Equal Split ist die einzige Split-Methode des MVP.
- Die Summe aller Expense-Anteile muss exakt dem Expense-Betrag entsprechen.
- Salden müssen aus den zugrunde liegenden Ausgaben, Aufteilungen und
  Settlements nachvollziehbar sein.
- Settlements verändern den aktuellen finanziellen Stand.
- Der MVP unterstützt einen Settlement-Modus zur globalen Minimierung der Anzahl
  erforderlicher Überweisungen.
- Statement Sharing gewährt keinen Gruppenzugriff.
- Offline First ist Teil des Kernworkflows und keine nachträgliche
  Zusatzfunktion.
- Kollaborativer Mehrbenutzerzugriff ist kein Bestandteil des MVP.
- Das MVP darf spätere Participation Invitations, zusätzliche Split-Methoden,
  weitere Share-Formate, PWA- und Native-Distribution nicht unnötig
  erschweren.

## Explicitly Not Decided Here

Dieses Dokument legt bewusst noch nicht fest:

- konkrete Laravel- oder Nuxt-Struktur,
- Datenbankschema,
- Domain-Klassen oder Eloquent Models,
- API-Endpunkte,
- Authentifizierungs- oder Session-Technologie,
- Cookie-, Token- oder Storage-Mechanismus,
- konkrete Offline-Datenbank oder Client-Persistenz,
- konkrete Sync-Strategie,
- genaue Konfliktauflösungsregeln,
- Service-Worker-Technologie,
- PWA-Plugin oder Manifest-Konfiguration,
- weitere Settlement-Proposal-Strategien,
- konkrete Statement-Ausgabeform,
- UI- und Navigationsstruktur,
- Account-Features nach dem MVP,
- Reihenfolge der Post-MVP-Funktionen.

Diese Entscheidungen werden in den jeweils dafür vorgesehenen Product-,
Engineering- und Architecture-Tasks getroffen.
