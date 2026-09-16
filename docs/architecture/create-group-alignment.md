# JoinSplit – Create Group Architecture Alignment

## Status and Scope

Stand: 2026-09-14. Dieser Architekturvertrag wurde am 2026-09-14 ausdrücklich
menschlich freigegeben: „Ja, ich gebe diesen Vertrag frei.“
JS-010 einschließlich UX-Übergabe ist freigegeben. Keine Implementierung begonnen.

Dieser Abgleich konkretisiert ausschließlich Create Group für JS-011
(local-first), JS-012 (Server-Slice) und JS-013 (Sync-Integration).
Er erweitert weder den M1-Slice um vollständige Participant-Verwaltung noch
um dauerhafte Browser-Persistenz.

Quellen: [Anonymous Access](anonymous-access.md),
[Domain Model](domain-model.md), [MVP](../product/mvp.md),
[UX Flow](../product/ux-flow.md),
[JS-010 Handoff](../product/wireframes/js-010/2026-09-14/review.md),
[Engineering Principles](../engineering/principles.md).
Ein separates kanonisches M1-Boundary-Dokument liegt im aktuellen Repository
nicht vor. Die hier verwendete technische M1-Grenze stammt aus
`anonymous-access.md`; die exakten GitHub-Task-Beschreibungen wurden in diesem
Abgleich mangels Zugriff nicht live verifiziert.

## Findings at Alignment

| Vorgabe | Befund | Nötige Anpassung |
| --- | --- | --- |
| Participant != Access Identity | Domain-Modell und UX stimmen überein | Keine Zusammenlegung oder Participant-Authentifizierung |
| Optionale Owner-Teilnahme, globaler Default true | UX freigegeben; Anonymous Access sagt pauschal kein automatischer Participant | Präzisieren: Ownership allein erzeugt keinen Participant; die sichtbare Auswahl darf einen separaten erzeugen |
| Lokaler Erfolg erst nach vollständigem Anlegen | UX freigegeben; Pending Mutation enthält bisher nur Group | Gemeinsamer lokaler Vorgang für Group, optionalen Participant und Pending Mutation |
| Duplikatfreier Retry | Group-ID und Erstellungsdaten sind bereits stabil vorgesehen | Optionalen Participant mit stabiler ID und unveränderten Erstellungsdaten einbeziehen |
| Stabile Participant-Reihenfolge | Domain-Invariante vorhanden | Initialer Participant ist erster Eintrag; spätere Einträge werden angehängt |
| Feste Währung EUR | UX freigegeben; Domain-Modell lässt konkrete Währung noch offen | EUR im Erstellungsvertrag berücksichtigen; Domain-Modell bleibt währungsneutral |
| M1 im Arbeitsspeicher | Anonymous Access und UX stimmen überein | Keine reload-feste Speicherung zusagen |

## Approved Creation Contract

### Input and Identity

Die sichtbare Checkbox wird bei Öffnung des Formulars aus der globalen
App-Einstellung vorbelegt, anfänglich `true`. Die konkrete Auswahl gehört zum
Formularentwurf. Eine Änderung des globalen Defaults verändert weder eine
bestehende Group noch einen bereits übernommenen Erstellvorgang.

Bei aktivierter Checkbox wird ein normaler, aktiver Participant derselben Group
angelegt. Sein Anzeigename gilt nur in dieser Group. Weder eine globale
Personenidentität noch eine automatische Verknüpfung als eigener App-Zugriff
ist dafür erforderlich. Bei deaktivierter Checkbox entsteht kein Participant;
ein ausgeblendeter Namenswert wird nicht in den Erstellvorgang übernommen.

Die bestehende Access Identity und ihr Credential bleiben getrennt und für die
laufende M1-Anwendung stabil. Group-ID und optionaler Participant-ID werden
clientseitig als voneinander unabhängige UUID v4 erzeugt. Die Participant-ID
ist nicht die Access Identity ID.

Freigegebene, auf Client und Server gleiche Validation:

- Group-Name: trimmen, 1–100 Zeichen wie bereits in JS-007 vorgesehen.
- Participant-Name: bei ausgewählter Teilnahme trimmen, 1–100 Zeichen.
  Die Obergrenze 100 wurde mit diesem Vertrag freigegeben.
- Gemeinsame Normalisierung: am Anfang/Ende U+0009–U+000D,
  U+0020, U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F,
  U+205F, U+3000 und U+FEFF entfernen; innere Zeichen unverändert lassen.
  Länge danach in Unicode-Codepoints zählen, nicht Bytes oder UTF-16-Einheiten.
  Keine zusätzliche Groß-/Kleinschreibung oder Unicode-Normalisierung.
  Beide Implementierungen mit gemeinsamen Umlaut-, Emoji- und Whitespace-
  Beispielen prüfen. Diese Präzisierung ist mit dem Vertrag freigegeben.
- Währung EUR, Group aktiv; optionaler initialer Participant aktiv und erster
  Eintrag der stabilen Participant-Reihenfolge.

### Pending Mutation

Der konzeptionelle CreateGroup-Payload wird erweitert:

| Feld | Bedeutung |
| --- | --- |
| `groupId` | Stabile clientseitige Group-ID |
| `name` | Normalisierter Group-Name |
| `currency` | EUR |
| `actorId` | Lokale Referenz auf die Access Identity; kein Ownership-Nachweis |
| `initialParticipant` | Entweder null oder `{ participantId, name }` mit normalisiertem Anzeigenamen |

Ein zweiter boolescher Payload-Wert für die Checkbox ist nicht nötig:
`initialParticipant = null` beschreibt die deaktivierte Auswahl eindeutig.
Die Formulardaten dürfen weiterhin einen booleschen UI-Wert verwenden.
Die Credentials sowie globale Einstellungen gehören nicht in diesen Payload.

Der gesamte normalisierte Payload wird nach lokalem Erfolg als unveränderlicher
Erstellungsstand gehalten. Retries lesen diesen Stand, nicht den aktuellen
Formularinhalt oder globale Defaults. Die Group-ID dient für diesen begrenzten
Vorgang als Wiedererkennung; kein allgemeines Idempotency-Framework nötig.

### Local Commit in JS-011

1. Gesamten Entwurf validieren; bei Fehlern bleibt er editierbar.
2. Identity bei Bedarf einmalig erzeugen; Group, optionalen Participant und
   Pending Mutation vorbereiten, ohne teilweise sichtbaren Domain-State.
3. Alle vorbereiteten fachlichen Daten und den Pending-Eintrag gemeinsam in den
   geteilten Client-State übernehmen. Im M1-Arbeitsspeicher darf es nach Rückkehr
   des Vorgangs keinen halbfertigen Zustand geben. Das ist eine lokale
   Konsistenzanforderung, keine Zusage einer dauerhaften Datenbanktransaktion.
4. Erst danach lokalen Erfolg melden und die leere Expense-Ansicht öffnen.
5. Scheitert die Vorbereitung/Übernahme, bleiben Group, Participant und Pending
   Entry aus diesem Versuch aus; Formular und Eingaben bleiben erhalten.
   Eine schon existierende Access Identity wird nicht verworfen oder rotiert.

Mehrfachklicks während derselben Übernahme werden abgefangen. Nach lokalem
Erfolg startet ein Sync-Retry keinen zweiten lokalen Create-Vorgang.

**Pinia-Schwelle erreicht:** Gruppenliste, Group-Ansicht und Sync benötigen
geteilten veränderbaren Group-/Participant-/Pending-State über Navigationen.
Pinia hält diesen M1-Anwendungszustand; kurzlebige Formularentwürfe bleiben
lokal. Identity/Credential bleiben davon logisch getrennt und werden nicht
als gewöhnliche Domain-/Mutationsdaten serialisiert.

### Server Commit in JS-012

Registrierung und Credential-Prüfung bleiben wie in JS-007 beschrieben.
Ownership entsteht ausschließlich aus dem verifizierten Actor. Öffentliche
`actorId` oder requestseitige Owner-/Participant-Angaben gewähren keinen Zugriff.

Laravel übernimmt Group plus optionalen initialen Participant gemeinsam in
einer Datenbanktransaktion. Ein Fehler darf keine Group ohne den angeforderten
Participant zurücklassen. Die separat registrierte Access Identity darf bestehen
bleiben. UUID-Eindeutigkeit und konkurrierende Requests müssen abgesichert sein;
ein Participant-ID-Konflikt wird nicht durch Übernahme eines fremden Participants
gelöst. Bestätigung erfolgt erst nach erfolgreichem Commit.

| Serverzustand | Ergebnis |
| --- | --- |
| Group fehlt; kompletter Payload gültig und IDs frei | Group und optionalen Participant gemeinsam erstellen |
| Group existiert beim selben Owner mit identischem ursprünglichem Erstellungsstand | Bereits ausgeführten Vorgang erfolgreich bestätigen; nichts erneut anlegen oder zurücksetzen |
| Derselbe Owner, aber abweichender ursprünglicher Erstellungsstand, einschließlich null vs. Participant, Participant-ID oder Name | Konflikt, keine Überschreibung oder Ergänzung |
| Group gehört anderem Owner | Ablehnen, keine fremden Daten offenlegen |
| IDs kollidieren oder bestehender Zustand ist inkonsistent | Ablehnen/prüfbaren Fehler melden; kein stilles Reparieren |

Eine vorhandene Group ohne initialen Participant wird bei einem Retry mit
Participant nicht nachträglich erweitert. Das wäre ein anderer Erstellvorgang.
Verlorene Antworten und parallele identische Requests erzeugen höchstens eine
Group und einen initialen Participant.

Der Vergleich bezieht sich auf ursprüngliche Erstellungsdaten, nicht auf später
bearbeitete Anzeigenamen. Für den begrenzten M1-Slice sind solche Bearbeitungen
noch nicht vorgesehen. Bevor sie eingeführt werden, muss der ursprüngliche
Erstellungsstand serverseitig zuverlässig wiedererkennbar bleiben oder eine
passende Nachfolgeregel beschlossen werden. Eine allgemeine Sync-Versionierung
oder unbegrenzte Mutationshistorie wird hier nicht festgelegt.

### Sync in JS-013

Die gesamte CreateGroup-Mutation wird als ein Vorgang bestätigt oder abgelehnt.
Der Client behält Identity, Credential, Group-ID, optionalen Participant-ID und
normalisierten Payload bei Verbindungsfehlern oder verlorener Antwort bei.
Nur dieser Vorgang wird nach passender Serverbestätigung als synchronisiert
markiert. Lokale fachliche Daten bleiben bei einem Sync-Fehler verfügbar.

Temporäre Netzwerk-/Serverfehler erlauben Retry. Validation-/Ownership-/ID-
Konflikte werden nicht mit neuen IDs automatisch erneut erstellt. Keine stille
Überschreibung und keine Erfolgsnavigation bei lokalem Fehler.
Connectivity und Sync-Status bleiben getrennt; Background Sync übernimmt keinen
Fokus. Credential-Daten erscheinen nicht in URLs, Logs, UI oder Fehlerdetails.

## Delivery and Verification

- JS-011: lokale Erstellung mit/ohne Participant, globale Vorbelegung true,
  pro Erstellung überschreibbar, abhängiges Namensfeld, Validation,
  konsistente State-Übernahme, Pending-Anzeige und Navigation. Einstellungen
  bleiben in M1 im laufenden App-State; keine dauerhafte Persistenz einführen.
- JS-012: erweiterte Validation, verifizierte Ownership, gemeinsame Transaktion,
  Eindeutigkeit und Retry-Vergleich für den vollständigen Erstellvorgang.
- JS-013: Registrierung, authentifizierter Versand, Retry desselben Vorgangs,
  Bestätigung, Offline-/Pending-/Fehlerdarstellung.

Für die spätere Implementierung sind insbesondere folgende Prüfungen relevant:

- Checkbox an: genau eine Group, ein separater Participant, ein Pending Entry;
  Checkbox aus: genau eine Group, kein Participant, ein Pending Entry.
- Fehlender/ungültiger Participant-Name und simulierte lokale Fehler hinterlassen
  keinen halbfertigen Domain-/Pending-State; Eingaben bleiben erhalten.
- Änderungen an Settings beeinflussen vorhandene Pending-Payloads nicht.
- Mehrfachklicks, verlorene Antwort und konkurrierende identische Requests
  erzeugen keine zusätzlichen Domain-Objekte.
- Abweichende Namen, IDs und null-vs.-Participant bei gleicher Group-ID führen
  zu Konflikt; andere Owner erhalten keine fremden Daten.
- Serverseitiger Participant-Insert-Fehler rollt Group-Insert zurück.
- Identischer Retry bestätigt Erfolg, ohne bestehenden Zustand zurückzusetzen.
- UI: sichtbare Labels, Fehlerzuordnung, sinnvoller Fokus, Statusmeldungen,
  44 × 44 px Touch-Ziele und mobile Bedienung wie im JS-010-Handoff vorgesehen.

Dies ist ein Dokumentabgleich; diese Verhaltenstests wurden nicht ausgeführt.

## Approval and Source Updates

Der gemeinsame Erstellvorgang, stabile Participant-ID, Initialreihenfolge,
erweiterte Retry-Semantik, M1-Settings im Arbeitsspeicher sowie Namensgrenze
und Trimming-/Längenregel sind menschlich freigegeben.
`anonymous-access.md`, `domain-model.md` und `ux-flow.md` wurden abgeglichen.
Die Befundtabelle oben dokumentiert den Ausgangsstand vor dieser Anpassung.

Konkrete API-, Tabellen- und Klassenformen bleiben in den jeweiligen Delivery-
Tasks zu konkretisieren. Dauerhafte Identity/Persistenz, App Shell und allgemeine
Offline-Sync-Konflikte werden durch diesen M1-Vertrag nicht entschieden.

Laut dem vom Nutzer übermittelten Worker-Bericht ist JS-010 im GitHub Project
Done und JS-011 weiterhin Todo; beide bleiben Drafts. Dies ist keine eigene
Live-Verifikation. Die Architekturvoraussetzung ist dokumentarisch geklärt;
JS-011 wurde hier nicht begonnen.
