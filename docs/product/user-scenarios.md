# JoinSplit – Primary User Scenarios

## Purpose

Dieses Dokument beschreibt die primären Nutzungsszenarien und fachlichen
Zugriffsmodelle von JoinSplit.

Es definiert, was Nutzer mit JoinSplit tun können und welche fachlichen Rollen
dabei existieren.

Technische Umsetzung, Datenmodell, API, Authentifizierungsmechanismen und
konkrete MVP-Abgrenzung sind nicht Bestandteil dieses Dokuments.

## Core Concepts

### Participant

Ein Participant ist eine Person, die finanziell an einer JoinSplit-Gruppe
beteiligt ist.

Ein Participant benötigt keinen JoinSplit-Account, keine Registrierung und
keinen eigenen Zugriff auf JoinSplit.

Eine einzelne Person kann die gesamte Gruppe verwalten und dabei weitere
Participants ausschließlich stellvertretend verwalten.

### App User

Ein App User verwendet JoinSplit selbst.

Die grundlegende Nutzung von JoinSplit erfordert keine Registrierung.

Ein App User kann anonym arbeiten oder optional einen registrierten Account
besitzen.

### Owner

Der Owner erstellt und verwaltet eine Gruppe.

Der Owner kann selbst anonym oder registriert sein.

Er darf:

- die Gruppe verwalten,
- Participants verwalten,
- alle Ausgaben der Gruppe verwalten,
- alle Settlements der Gruppe verwalten,
- Statements für alle Participants teilen,
- Participants zur eigenen Nutzung von JoinSplit einladen.

### Invited Participant

Ein bestehender Participant kann optional eigenen Zugriff auf die Gruppe
erhalten.

Dafür ist zunächst keine Registrierung erforderlich.

Der Participant bleibt fachlich dieselbe Person; durch die Einladung entsteht
kein zweiter Participant.

## Primary User Scenarios

### UC-01 – Gruppe erstellen

Ein App User erstellt eine neue JoinSplit-Gruppe für ein gemeinsames Vorhaben.

Die grundlegende Erstellung einer Gruppe erfordert keinen registrierten
Account.

Der Ersteller wird zum Owner der Gruppe.

### UC-02 – Participants hinzufügen und verwalten

Der Owner kann weitere Personen als Participants zur Gruppe hinzufügen.

Diese Personen müssen JoinSplit nicht selbst verwenden.

Dadurch kann beispielsweise eine einzige Person eine komplette Gruppe
verwalten.

Alle Participants können trotzdem vollständig in die Kostenverteilung
einbezogen werden.

### UC-03 – Ausgabe erfassen

Ein berechtigter App User kann eine gemeinsame Ausgabe erfassen.

Dabei wird mindestens fachlich nachvollziehbar:

- wofür die Ausgabe entstanden ist,
- wer bezahlt hat,
- welche Participants daran beteiligt sind,
- wie die Ausgabe zwischen ihnen verteilt wird.

Die Person, die eine Ausgabe in JoinSplit erfasst, muss nicht dieselbe Person
sein, die sie bezahlt hat.

Damit gilt:

Erfasst von ≠ bezahlt von.

#### Bearbeitungsrechte

Der Owner darf alle Ausgaben der Gruppe verwalten.

Ein eingeladener Participant darf:

- eigene Ausgaben erfassen,
- von ihm selbst erfasste Ausgaben bearbeiten,
- von ihm selbst erfasste Ausgaben löschen.

Er darf Ausgaben, die von anderen App Usern erfasst wurden, nicht bearbeiten
oder löschen.

Die Bearbeitungsrechte richten sich nach dem Ersteller des Datensatzes und
nicht nach der Person, die die Ausgabe bezahlt hat.

### UC-04 – Aktuellen Stand verstehen

JoinSplit soll nicht erst beim finalen Ausgleich Nutzen erzeugen.

App User sollen jederzeit nachvollziehen können:

- welche Ausgaben vorhanden sind,
- wie diese verteilt wurden,
- welchen Anteil einzelne Participants tragen,
- welche Zahlungen bereits berücksichtigt wurden,
- welche aktuellen Salden daraus entstehen.

Der Settlement-Schritt ist das Ergebnis dieser Transparenz und nicht der
alleinige Zweck von JoinSplit.

### UC-05 – Ausgleichsvorschlag ansehen

JoinSplit kann aus dem aktuellen Stand der Gruppe ableiten, welche Zahlungen
zwischen Participants die offenen Salden ausgleichen würden.

Der Vorschlag muss aus den zugrunde liegenden Ausgaben, Aufteilungen und
bereits erfassten Settlements nachvollziehbar sein.

Die konkrete Berechnungsmethode wird in einem späteren fachlichen bzw.
technischen Task definiert.

### UC-06 – Erfolgte Ausgleichszahlung erfassen

Eine tatsächlich erfolgte Zahlung zwischen Participants kann in JoinSplit als
Settlement erfasst werden.

Ein eingeladener Participant darf ein Settlement erfassen, wenn er selbst an
der Zahlung beteiligt ist.

Fremde Settlements zwischen anderen Participants darf ein eingeladener
Participant nicht verändern.

Der Owner darf alle Settlements der Gruppe verwalten.

Für den ersten Produktumfang ist keine Gegenbestätigung durch die andere
beteiligte Person erforderlich.

## Anonymous-first Usage

JoinSplit ist grundsätzlich ohne Registrierung nutzbar.

Ein Nutzer soll insbesondere:

- JoinSplit öffnen,
- eine Gruppe erstellen,
- Participants hinzufügen,
- Ausgaben erfassen,
- Salden verstehen,
- Statements teilen,
- Settlements verwalten

können, ohne vorher einen Account erstellen zu müssen.

Die gemeinsamen Gruppendaten werden serverseitig verwaltet.

Der Client kann Informationen lokal halten, die für den jeweiligen anonymen
Zugriff, die Identität des App Users und produktseitig erforderliche
Client-Funktionen benötigt werden.

Welche Daten dafür lokal gespeichert werden und wie diese mit der serverseitigen
Repräsentation synchronisiert werden, ist eine technische
Architekturentscheidung.

Die konkrete technische Umsetzung dieser Identität ist keine
Produktentscheidung dieses Dokuments.

Insbesondere wird hier noch nicht festgelegt:

- Cookie oder Token,
- Local Storage oder anderer Client Storage,
- Sanctum-Konfiguration,
- Ablaufzeiten,
- Secure Storage für Native Apps.

## Optional Registration

Registrierung ist eine optionale Erweiterung des grundlegenden
JoinSplit-Workflows.

M5 setzt diese Erweiterung als **Accounts & Multi-Device Access** um. Die
accountlose Nutzung bleibt erhalten. Nach ausdrücklicher Bestätigung übernimmt
die Registrierung die im Browser vorhandenen Groups; bereits synchronisierte
Groups werden verknüpft, andere lokale Groups authentifiziert und idempotent
importiert.

Dabei dürfen bestehende Participants, Gruppenzugriffe und
Gruppenmitgliedschaften nicht verloren gehen oder dupliziert werden.

Ein Account kann mehrere Access Identities besitzen und seine Daten nach einer
Anmeldung auf weiteren Geräten in IndexedDB rehydrieren. Account und
Participant bleiben getrennt; ein Account wird nicht automatisch Participant.

Der M5-Vertrag ist in
[`account-data-adoption.md`](../architecture/account-data-adoption.md)
festgelegt. Participation Invitations und kollaborative Berechtigungen bleiben
außerhalb von M5.

## Participation Invitation

Ein Participant muss niemals eigenen Zugriff auf JoinSplit erhalten.

Der Owner darf einen Participant dauerhaft ausschließlich stellvertretend
verwalten.

Optional kann der Owner einem bereits bestehenden Participant eigenen Zugriff
ermöglichen.

Der fachliche Ablauf ist:

Participant existiert bereits
→ Owner erstellt Participation Invitation
→ Einladung wird geteilt
→ Participant nimmt Einladung an
→ eigener Zugriff auf bestehenden Participant
→ Nutzung anonym möglich
→ optionale spätere Registrierung

Die Einladung erzeugt keinen neuen Participant.

Eine spätere Registrierung darf ebenfalls keinen zweiten Participant oder eine
zusätzliche Gruppenmitgliedschaft erzeugen.

## Sharing

JoinSplit unterscheidet zwei fachlich unterschiedliche Sharing-Funktionen:

1. Statement Share
2. Participation Invitation

Sie dürfen nicht miteinander vermischt werden.

### Statement Share

Ein Statement dient ausschließlich dazu, einer Person ihren aktuellen
finanziellen Stand verständlich mitzuteilen.

Für den ersten Produktumfang wird ein Snapshot priorisiert.

Ein Statement Snapshot ist:

- statisch,
- read-only,
- auf genau einen Participant bezogen,
- eine Darstellung des Stands zum Zeitpunkt des Teilens.

Er enthält mindestens:

- den relevanten Participant,
- dessen relevante Ausgabenanteile,
- berücksichtigte Settlements,
- den daraus resultierenden aktuellen Saldo,
- sofern ableitbar den daraus resultierenden Ausgleich.

Das Teilen eines Statements:

- gibt keinen Zugriff auf die Gruppe,
- verleiht keine Bearbeitungsrechte,
- setzt keinen JoinSplit-Account voraus.

Der Owner darf Statements aller Participants teilen.

Ein eingeladener Participant darf nur sein eigenes Statement teilen.

Die konkrete Ausgabeform – beispielsweise Text, Bild, PDF oder
System-Share-Funktion – wird später entschieden.

#### Future Direction

Langfristig kann zusätzlich ein read-only Live Statement angeboten werden, das
den aktuellen Gruppenstand darstellt.

Dies gehört nicht zum zunächst priorisierten Snapshot-Modell und erfordert
zusätzliche Entscheidungen zu Zugriff und Datenschutz.

### Participation Invitation

Eine Participation Invitation dient dagegen dazu, einem bestehenden
Participant eigenen Zugriff auf JoinSplit zu geben.

Sie ist keine finanzielle Abrechnung und kein Statement.

Damit gilt:

Statement Share
→ Information teilen

Participation Invitation
→ App-Zugriff ermöglichen

## Permission Summary

| Aktion | Owner | Invited Participant | Participant ohne App-Zugriff |
| --- | --- | --- | --- |
| Gruppe ansehen | Ja | Ja | Nein |
| Salden ansehen | Ja | Ja | Nein |
| Participants verwalten | Ja | Nein | Nein |
| Ausgabe erfassen | Ja | Ja | Nein |
| selbst erfasste Ausgabe ändern | Ja | Ja | Nein |
| selbst erfasste Ausgabe löschen | Ja | Ja | Nein |
| fremde Ausgabe ändern/löschen | Ja | Nein | Nein |
| eigenes beteiligtes Settlement erfassen | Ja | Ja | Nein |
| fremdes Settlement verwalten | Ja | Nein | Nein |
| eigenes Statement teilen | Ja | Ja | Nein |
| Statements anderer Participants teilen | Ja | Nein | Nein |
| Participant einladen | Ja | Nein | Nein |

## Product Constraints Established by These Scenarios

- Participant und User sind fachlich nicht dasselbe.
- Registrierung ist für die grundlegende Nutzung optional.
- Eine Gruppe kann vollständig von einer einzigen Person verwaltet werden.
- Ein Participant kann existieren, ohne JoinSplit jemals selbst zu verwenden.
- Ein bestehender Participant kann später eigenen Zugriff erhalten.
- Registrierung darf bestehende anonyme Nutzung nicht duplizieren oder
  verlieren lassen.
- Ausgabenrechte richten sich nach dem Erfasser, nicht nach dem Zahler.
- Settlement und Expense sind fachlich unterschiedliche Vorgänge.
- Statement Sharing und Participation Invitation sind unterschiedliche
  Konzepte.
- JoinSplit schafft Transparenz über Ausgaben, Aufteilungen und Salden bereits
  vor einem finalen Settlement.

## Explicitly Not Decided Here

Dieses Dokument legt bewusst noch nicht fest:

- Account-Details außerhalb des separat freizugebenden
  [`Account and Data-Adoption Contract`](../architecture/account-data-adoption.md),
- konkrete Split-Methoden,
- Rundungsregeln,
- Datenbankschema,
- Laravel Models,
- API-Endpunkte,
- UI-Struktur,
- Live-Statement-Security,
- konkrete Share-Formate,
- MVP-Abgrenzung dieser Szenarien.

Diese Entscheidungen werden in den folgenden Product- und Architecture-Tasks
getroffen.
