# Zusammenfassung der Scrollanimations-Referenz

Quelle: <https://www.youtube.com/watch?v=16PncZlSNds>

Analysiert am: 28. Oktober 2026

## Kernaussage

Das Video zeigt, wie CSS-Scroll-Timelines Animationen unmittelbar an die Position eines Elements im Viewport koppeln. Dadurch werden Anfang, Zwischenzustand, Ende und Rückwärtsbewegung vom Scrollen gesteuert und benötigen weder JavaScript noch feste Zeitangaben.

## Gezeigte Muster

- Text: Deckkraft `0 → 1`, gleichzeitig Aufwärtsbewegung aus etwa 100 Pixeln Abstand.
- Medien: Unschärfe, Entsättigung, Abdunklung, Verkleinerung und Versatz werden bis zum natürlichen Zustand abgebaut.
- Timeline: Karten erhalten aufeinanderfolgende Bereiche wie `20–40`, `40–60` und `60–80 Prozent`.
- Fokus: Inhalte sind im mittleren Viewport-Bereich scharf und ruhig.
- Horizontaler Inhalt: bestehendes Overflow wird mit Scroll-Snap und sanftem Scrollen verbessert.

## Übertragung auf JoinSplit

Die allgemeine Bild- und Textenthüllung der Landingpage entspricht bereits der Referenz. Verbesserungspotenzial bestand im Abschnitt „In drei Schritten“: Seine Listenelemente nutzten zwar unterschiedliche Bereiche, wirkten visuell aber wie drei gleichartige Standard-Fades.

Die angepasste Richtung:

- gemeinsamer vertikaler Fortschrittsfaden für die nachvollziehbare Abfolge,
- eigene, überlappende Scrollbereiche für Schritt 1, 2 und 3,
- abwechselnde leichte Bewegung von links und rechts,
- moderate Skalierung `94 → 100 Prozent` statt der demonstrativen `50 → 100 Prozent`,
- kurze Unschärfe- und Sättigungsenthüllung,
- sofort vollständig sichtbare Darstellung für direkte Abschnittslinks, Druck und reduzierte Bewegung.

Ein horizontaler Scrollbereich bleibt bewusst aus: Auf der JoinSplit-Landingpage existiert derzeit kein Inhalt, der dieses Bedienmuster fachlich rechtfertigt.

## Nachtrag: Erklärungsgrafik als Prozess

Die große Erklärungsgrafik wird nicht länger als einzelnes Bild global unscharf ein- und ausgeblendet. Sie ist inhaltlich ein Prozess und wird deshalb schrittweise behandelt:

- Der Rahmen und Hintergrund bleiben immer scharf und stabil.
- Karte und Nummer 1 werden zuerst aktiviert.
- Danach folgen Verbindung und Karte 2.
- Verbindung und Karte 3 schließen die Sequenz ab.
- Erreichte Schritte bleiben klar, während der nächste Schritt aus reduziertem Kontrast, leichter Verkleinerung und vertikalem Versatz einläuft.

## Finales Verhalten der Erklärungsgrafik

Die erste Umsetzung wurde nach der visuellen Prüfung bewusst zwischen Desktop
und Mobile getrennt:

- Auf Desktop startet eine zeitbasierte Sequenz, sobald mindestens 60 Prozent
  der gesamten Grafik sichtbar sind. Sie läuft anschließend unabhängig von der
  weiteren Scrollbewegung vollständig durch alle drei Karten.
- Nach dem weitgehenden Verlassen des Viewports wird die Sequenz erneut
  freigegeben. Damit startet sie auch beim Scrollen von unten nach oben.
- Auf Mobile bleiben Rahmenzeichnung und Nummern-Bounce an die gemeinsame
  Scroll-Timeline gekoppelt. Die drei Karten besitzen getrennte, aufeinander
  folgende Bereiche und laufen beim Zurückscrollen nachvollziehbar rückwärts.
- Direkte Abschnittslinks, Tastaturfokus, Druck und reduzierte Bewegung zeigen
  die vollständige Grafik ohne Animation. Inhalt und Bedienbarkeit hängen damit
  nicht von der Browserunterstützung für Scroll-Timelines ab.

Die Kartenrahmen bleiben im Ruhezustand dünn und zurückhaltend. Die farbige
Rahmenzeichnung liegt als separate ein Pixel breite Ebene darüber. Verbindungen
zwischen den Karten besitzen einen expliziten Stapelkontext, damit ihre Pfeile
nicht hinter angrenzenden Karten verschwinden.

## Begleitende Header-QA

Die visuelle Prüfung der lokalen Vorschau zeigte zwei unabhängige Headerfehler:

- Der Desktop-Header wurde bereits bei 720 Pixeln aktiviert und stauchte dort
  die Wortmarke unter den Beta-Badge. Der Wechsel erfolgt deshalb erst ab
  768 Pixeln; darunter bleibt der kompakte mobile Header bestehen.
- Im blauen Material-Design lagen weiße Utility-Icons auf weißen Flächen. Die
  Controls verwenden nun eine leicht transparente helle Fläche; der aktive
  Theme-Zustand wird als weißer Kreis mit blauem Icon dargestellt.
