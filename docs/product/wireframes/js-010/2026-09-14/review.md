# JS-010 – Abschlussprüfung und UX-Übergabe

Stand: 2026-09-14. Status: menschlich freigegeben und fachlich abgeschlossen.
Wolfgang hat den korrigierten Gesamtstand einschließlich der UX-Übergabe am
2026-09-14 ausdrücklich mit „Ja, ich gebe das frei.“ bestätigt.
Laut dem vom Nutzer übermittelten Worker-Bericht ist JS-010 im GitHub Project
Done; JS-011 bleibt Todo. Keine eigene Live-Verifikation.

Figma: https://www.figma.com/design/jaNwaunORIBGyWUC980dla

## Abdeckung und Review-Reihenfolge

| Schritt | Ansichten und Zustände | Prüfschwerpunkt |
| --- | --- | --- |
| 1 / A | Gruppenliste, globale Einstellungen, Group-Erstellung, Checkbox an/aus, Namensfehler, leere Expense-Ansicht, offline, pending, sync failed, synced | Owner-Teilnahme, lokaler Erfolg, Fehlermeldungen |
| 2 / B | Participants, leerer Zustand, hinzufügen, Namenswarnung, Financial State, bearbeiten, deaktivieren | Participant ist kein App-Zugriff |
| 3 / C | Expenses, erfassen, Equal Split, Person ergänzen bei erhaltenem Entwurf, Details, bearbeiten, Löschen bestätigen | Payer und Beteiligte ausdrücklich wählen; Summe der Shares |
| 4 / D | Balances, Zusammensetzung, beide Proposal-Strategien, ausgeglichener Zustand, Pending-/Konflikthinweis | Proposal ist keine Zahlung |
| 5 / E | Settlement aus Proposal oder manuell, Teilzahlung, Validation, Details, bearbeiten, Löschen bestätigen, lokaler Erfolg | Tatsächlich erfolgte Zahlung; sofortige Balance-Auswirkung |
| 6 / F | Snapshot-Auswahl, Vorschau, Kopieren/Sharing-Fallback, Archivierung, read-only Group, Reaktivierung und zulässige Group-Löschung | Snapshot bleibt statisch; Archivierung trotz offenem Saldo/Sync |
| 7 / Ergänzungen | Participant reaktivieren/löschen, Expense-Validation, lokaler Speicherfehler, Archivfilter, Settlement-Verlauf | Zustände vorhandener Views; keine neuen Hauptansichten |

Die Phasen B–F sind Unterteilungen des bestehenden JS-010, keine zusätzlichen
Projektaufgaben. Beispielbeträge verschiedener Varianten sind unabhängige
Szenarien. Der Snapshot für Max zeigt nach Empfang von 6,00 EUR einen Saldo von
0,00 EUR: 96,00 bezahlt minus 90,00 eigene Anteile minus 6,00 empfangen.
Archivvarianten zeigen ausdrücklich einen alternativen Stand vor den Zahlungen.

## Korrekturen in diesem Abschlussdurchlauf

- Frühere Phase-A-Abschnitte 01–03 ausgeblendet; Abschnitt 04 ist die aktuelle
  Create-Group-Grundlage. Die früheren Elemente bleiben in der Figma-Sicherung.
- Außenrahmen auf Hug contents gestellt; unbeabsichtigter Leerraum entfernt.
- Statement-Saldo und Ausgleich nach erfolgtem Settlement korrigiert;
  Löschbeschriftung verkürzt, damit sie im Button bleibt.
- Participant- und Bearbeitungsformulare als ungespeicherte Entwürfe beschriftet.
- Equal-Split-Auswahl mit 44 px hohen Zeilen und 48 px Abstand konkretisiert.
- Fehlende Lifecycle-, Fehler- und Verlaufsvarianten ergänzt.
- Konfliktgrund „Version veraltet“ ausdrücklich als Beispiel gekennzeichnet;
  damit wird keine technische Versionierungsregel festgelegt.

Bei einer manuellen Auswahl wurde der Außenrahmen versehentlich gelöscht.
Die Änderung wurde sofort rückgängig gemacht. Der anschließend exportierte
Gesamtstand enthält wieder alle aktuellen Phasen und die Ergänzungen.

## UX-Übergabe für JS-011

- **View:** eigene mobile Create-Group-Ansicht, erreichbar aus der Gruppenliste;
  globale Einstellungen sind aus dem App-Kontext erreichbar.
- **Formular:** Gruppenname, feste Währung EUR, sichtbare Checkbox „Mich als
  Teilnehmer hinzufügen“. Ihr anfänglicher globaler Standard ist aktiviert;
  pro Erstellung überschreibbar. Unmittelbar darunter erscheint bei Aktivierung
  das Pflichtfeld „Mein Name in dieser Gruppe“. Bei Deaktivierung entfällt es.
- **Validation:** Gruppenname getrimmt, 1–100 Zeichen. Participant-Name bei
  aktivierter Checkbox erforderlich. Fehler direkt beim jeweiligen Feld;
  Eingaben bleiben erhalten. Keine zusätzliche globale Participant-Identität.
- **Lokaler Erfolg und Navigation:** Group und optionaler separater Participant
  müssen erfolgreich angelegt sein, bevor zur leeren Expense-Ansicht navigiert
  und Erfolg gemeldet wird. Owner Access Identity bleibt getrennt.
- **Lokaler Speicherfehler:** keine Erfolgsnavigation; Formular und Eingaben
  erhalten, verständlicher Fehler und Wiederholung des lokalen Speicherns.
- **Pending Sync:** kontextueller Textstatus in der Group, ohne Sperre des lokalen
  Kernworkflows. Ausstehender Sync ist kein ausstehendes Settlement.
- **Offline:** Verbindung getrennt vom Sync-Status textlich anzeigen; lokale
  Erstellung erfordert keine Serverantwort.
- **Sync failed:** lokale Änderungen erhalten; kontextueller Fehler mit Retry
  für vorübergehende Fehler. Kein erneutes Create-Group-Formular nötig.
- **Retry:** den bestehenden ausstehenden Vorgang wiederholen; keine zweite
  Group oder zweiten Participant erzeugen. Abgelehnte Vorgänge/Konflikte
  verständlich anzeigen und prüfen; keine stille Überschreibung. Die konkrete
  Konfliktkorrektur wird separat definiert.
- **Fokus:** bei Validation erstes ungültiges Feld; nach erfolgreicher lokaler
  Erstellung Überschrift der geöffneten Group-Ansicht. Hintergrund-Sync und
  Sync-Fehler stehlen keinen Fokus. Dialoge führen zum Auslöser zurück.
- **Accessibility:** sichtbare Labels, logische Reihenfolge, nachvollziehbares
  abhängiges Namensfeld, Fehlerzuordnung, sichtbarer/unverdeckter Fokus,
  Textstatus statt alleiniger Farbe, Statusankündigungen und mindestens 44 × 44
  px als geplante Touch-Ziele. Zoom/Reflow später am realen UI prüfen.
- **M1-Grenze:** keine Zusage dauerhaften Zugriffs oder reload-fester Speicherung.
  Der begrenzte M1-Stand kann Daten/Zugriff bei Reload oder Tab-Verlust verlieren.

Globale Proposal-Standardstrategie: einfacher deterministischer Ausgleich.
Settings-Persistenz und vollumfängliches Offline First sind separate technische
Entscheidungen.

## Offene Punkte und Grenzen

Der [Create-Group-Vertrag](../../../../architecture/create-group-alignment.md)
wurde am 2026-09-14 ausdrücklich menschlich freigegeben. Group und optionaler
Participant werden gemeinsam angelegt, mit stabilen IDs und unverändertem
Retry-Payload. Beide Namen umfassen nach der vertraglichen Trimming-Regel
1–100 Unicode-Codepoints. M1-State und Settings bleiben im Arbeitsspeicher.
Der Architekturvorbehalt vor JS-011 ist dokumentarisch geklärt.

Historische Expenses mit inaktiven Participants, Grenzen von Überzahlungen,
dauerhafte Identität/Persistenz, App Shell und Konfliktbehandlung bleiben gemäß
`ux-flow.md` offen. Sie sind keine neue Product-Design-Phase.

Die Wireframes sind editierbare Figma-/SVG-Textstrukturen, kein vollständig
verdrahteter interaktiver Prototyp. B–F und Ergänzungen besitzen kein vollständig
natives Auto Layout oder Komponentenbibliothek. Ein Layout-/Exportreview prüft
keine tatsächliche Tastatur-, Screenreader- oder Reflow-Funktion. Eine formale
Accessibility-Konformität wird nicht behauptet.

Die .fig-Sicherung wurde strukturell geprüft, aber nicht testweise reimportiert.
Kommentare und Versionshistorie gehören nicht zum lokalen Backup.

## Menschliche Abschlussprüfung

Die menschliche Abschlussprüfung des korrigierten Gesamtstands einschließlich
der UX-Übergabe ist ausdrücklich freigegeben. Laut dem vom Nutzer übermittelten
Worker-Bericht wurde JS-010 auf Done gesetzt und zurückgelesen. JS-011 bleibt
Todo; seine Architekturvoraussetzungen waren bereits hinterlegt. Beide bleiben
Drafts. Der Architekturvertrag ist inzwischen ebenfalls menschlich freigegeben.

Hier wurde kein eigener GitHub-Schreibzugriff vorgenommen; der Status stammt
aus dem Worker-Bericht. Der beiliegende Worker-Prompt bleibt als historischer
Auftrag erhalten und muss für den berichteten Abschluss nicht erneut ausgeführt
werden. Technische Grenzen der statischen Wireframes bleiben bestehen.
