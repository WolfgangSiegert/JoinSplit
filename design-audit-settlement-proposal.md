# JoinSplit – Ausgleichsvorschlag: fokussierter UX- und Accessibility-Audit

## Audit scope

- Oberfläche: Gruppensalden und Ausgleichsvorschlag auf Mobile
- Nutzerziel: Innerhalb weniger Sekunden verstehen, wer wem welchen Betrag zahlen soll, und anschließend eine tatsächliche Zahlung erfassen
- Accessibility-Ziel: WCAG 2.2 AA als Produktrichtung; Screenshots allein belegen keine vollständige Konformität
- Ausgangszustand: `design-audit-settlement-before.jpg`
- Überarbeiteter Zustand: `design-audit-settlement-after.jpg`

## Schritt 1 – Salden erfassen

Gesundheit: gut. Die Personen, Vorzeichen und Texte „Soll erhalten/Soll zahlen“ machen die Einzelstände verständlich. Die Trennung zwischen Salden und dem daraus abgeleiteten Vorschlag war bereits korrekt.

## Schritt 2 – Ausgleichsvorschlag verstehen

Gesundheit vorher: verbesserungsbedürftig. Die Vorschläge bestanden aus textlastigen Einzelkarten. Betrag, Sender, Empfänger und Richtung hatten keine klare visuelle Reihenfolge. Strategie und Erklärung standen vor dem eigentlichen Ergebnis und verlangsamten das Erfassen.

Gesundheit nachher: gut. Der Abschnitt beginnt mit Handlung und Ergebnis: Anzahl der Zahlungen, Gesamtbetrag und der explizite Hinweis „Noch nicht verbucht“. Jede Zahlung ist nummeriert und zeigt Betrag, Zahler, Empfänger, Avatare und Richtung als einen zusammenhängenden Geldfluss. Farbe ist ergänzend; Rollen und Richtung werden zusätzlich durch Text und Icon vermittelt.

## Schritt 3 – Zahlung erfassen

Gesundheit vorher: verbesserungsbedürftig. Der Vorschlag endete ohne direkte nächste Aktion.

Gesundheit nachher: gut. Eine primäre Aktion führt in die bestehende Zahlungserfassung. Sie legt weiterhin nichts automatisch an und bewahrt damit die fachliche Trennung zwischen Rechenhilfe und tatsächlich erfolgter Zahlung.

## Wichtigste Änderungen

1. Ergebnis vor Berechnungseinstellung gestellt.
2. „So gleicht ihr aus“ als handlungsorientierte Überschrift eingeführt.
3. Anzahl und Gesamtsumme als kompakte Zusammenfassung ergänzt.
4. Zahlungsrichtung mit Teilnehmeridentität, Rollenbegriffen und Pfeil visualisiert.
5. Strategie in einen nachrangigen, aufklappbaren Bereich verschoben.
6. Direkten Einstieg in die vorhandene Zahlungserfassung ergänzt.
7. Screenreader erhalten pro Schritt einen vollständigen, linearen Zahlungssatz.

## Evidence limits

- Hell- und Darkmode wurden visuell im laufenden Produkt geprüft.
- Semantik und zugängliche Namen wurden über den Browserbaum geprüft.
- Typecheck, 234 Unit-Tests und Produktions-Build sind bestanden.
- Die vollständige End-to-End-Suite konnte in dieser Umgebung wegen ihrer externen Testserver nicht ausgeführt werden.
- Kontrastmessungen, Tastaturdurchlauf, Zoom bis 400 Prozent und mehrere reale Namenslängen bleiben separate manuelle WCAG-Prüfungen.
