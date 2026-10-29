# Inhaltsprotokoll: „Scroll Animation using only CSS | No JavaScript"

Quelle: <https://www.youtube.com/watch?v=16PncZlSNds>

Kanal: CSSnippets

Länge: 7:19 Minuten

Analysiert am: 28. Oktober 2026

Hinweis: Dieses Dokument ist ein zeitcodiertes, paraphrasiertes Inhaltsprotokoll der automatisch erzeugten englischen Untertitel, keine wortgetreue Abschrift.

## Zeitcodiertes Protokoll

- **00:00–00:31 – Ausgangslage:** Eine einfache HTML-/CSS-Landingpage gewinnt durch Scrollanimationen deutlich an Wirkung. Die besondere Herausforderung ist die präzise Steuerung von Anfang, Ende und Rückwärtsbewegung ohne JavaScript.
- **00:32–01:41 – Rotation über `view()`:** Ein sichtbares Element rotiert abhängig von seiner Position im Viewport. `animation-timeline: view()` ersetzt eine feste Zeitdauer durch Scrollfortschritt. Beim Zurückscrollen läuft die Bewegung automatisch rückwärts.
- **01:42–02:52 – Text einblenden:** Überschriften und Absätze starten vollständig transparent und 100 Pixel tiefer. Sie werden beim Eintritt in den Viewport eingeblendet und nach oben geführt. `animation-range` grenzt den wahrnehmbaren Bewegungsweg ein; anschließend bleibt der Text ruhig lesbar.
- **02:53–04:17 – Bildenthüllung:** Bilder beginnen unscharf, entsättigt, abgedunkelt, etwas kleiner und nach unten verschoben. Während des Scrollens werden sie scharf, farbig, hell und erreichen ihre Originalgröße. Zwei Werte in `view()` steuern Beginn und Abschluss im Viewport.
- **04:18–05:27 – Gestaffelte Timeline:** Mehrere Timeline-Karten beginnen fast unsichtbar, verkleinert und nach unten versetzt. Die erste Karte nutzt ungefähr `entry 20% / cover 40%`, die zweite `40% / 60%`, die dritte `60% / 80%`. Dadurch erscheint die Reihenfolge direkt aus dem Scrollfortschritt statt aus einer zeitbasierten Verzögerung.
- **05:28–06:36 – Schärfefokus:** Text wird aus starker Unschärfe in einen scharfen Mittelbereich geführt. Ein mehrstufiger Keyframe-Verlauf kann Inhalte im Zentrum des Viewports hervorheben und danach wieder zurücknehmen.
- **06:37–07:19 – Horizontaler Bereich:** Ein bereits horizontal überlaufender Abschnitt erhält `overflow-x: auto`, verpflichtendes Scroll-Snap und sanftes Scrollen. Der Effekt ist als Bedienmuster gedacht, nicht als dekorativ erzeugter Zusatzbereich.

## Für JoinSplit relevante Aussagen

1. Scrollfortschritt ersetzt eine feste Animationsdauer.
2. Einzelne Schritte brauchen eigene, klar getrennte Bereiche auf einer gemeinsamen Timeline.
3. Inhalte sollen ihre Ruheposition erreichen, bevor sie gelesen oder bedient werden.
4. Rückwärtsbewegung entsteht ohne zusätzlichen Zustands- oder JavaScript-Code.
5. Starke Beispielwerte wie 100 Pixel Versatz oder 50 Prozent Skalierung sind Demonstrationswerte und müssen für eine produktive Oberfläche reduziert werden.
