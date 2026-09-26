<template>
  <figure class="landing-graphic" aria-labelledby="landing-graphic-title landing-graphic-description">
    <figcaption class="sr-only">
      <span id="landing-graphic-title">So funktioniert JoinSplit</span>
      <span id="landing-graphic-description">Eine Gruppe anlegen, Ausgaben gleichmäßig aufteilen und offene Salden ausgleichen.</span>
    </figcaption>

    <ol class="landing-graphic__steps">
      <li class="landing-graphic__card landing-graphic__card--group">
        <span class="landing-graphic__number" aria-hidden="true">1</span>
        <p class="landing-graphic__eyebrow">Gruppe</p>
        <p class="landing-graphic__title">Hüttentour</p>
        <div class="landing-graphic__avatars" aria-hidden="true">
          <span>A</span><span>B</span><span>C</span>
        </div>
        <p class="landing-graphic__caption">Alle Mitreisenden an einem Ort</p>
      </li>

      <li class="landing-graphic__card landing-graphic__card--expense">
        <span class="landing-graphic__number" aria-hidden="true">2</span>
        <p class="landing-graphic__eyebrow">Ausgabe</p>
        <div class="landing-graphic__amount-row">
          <span>Unterkunft</span><strong>12,01 €</strong>
        </div>
        <div class="landing-graphic__split" aria-label="Aufgeteilt in 4,01 Euro, 4 Euro und 4 Euro">
          <span>4,01 €</span><span>4,00 €</span><span>4,00 €</span>
        </div>
        <p class="landing-graphic__caption">Rest-Cents werden fair verteilt</p>
      </li>

      <li class="landing-graphic__card landing-graphic__card--balance">
        <span class="landing-graphic__number" aria-hidden="true">3</span>
        <p class="landing-graphic__eyebrow">Ausgleich</p>
        <div class="landing-graphic__transfer">
          <span class="landing-graphic__person"><i aria-hidden="true">B</i>Ben</span>
          <span class="landing-graphic__arrow" aria-hidden="true">→</span>
          <strong>4,00 €</strong>
          <span class="landing-graphic__arrow" aria-hidden="true">→</span>
          <span class="landing-graphic__person"><i aria-hidden="true">A</i>Ava</span>
        </div>
        <p class="landing-graphic__caption">Ein klarer Vorschlag statt Kopfrechnen</p>
      </li>
    </ol>
  </figure>
</template>
