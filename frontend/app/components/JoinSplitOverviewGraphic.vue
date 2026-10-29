<template>
  <figure
    ref="graphic"
    class="landing-graphic"
    :class="{
      'landing-graphic--desktop-play': desktopAnimationStarted,
      'landing-graphic--mobile-motion': mobileMotionEnabled,
    }"
    aria-labelledby="landing-graphic-title landing-graphic-description"
  >
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
          <span>Unterkunft</span><strong>120,01 €</strong>
        </div>
        <p class="landing-graphic__payer"><i aria-hidden="true">A</i><span>Bezahlt von Ava</span></p>
        <div class="landing-graphic__split" aria-label="Salden nach der Aufteilung: Ava erhält 80 Euro, Ben zahlt 40 Euro und Chris zahlt 40 Euro">
          <span class="landing-graphic__split-item landing-graphic__split-item--positive"><i aria-hidden="true">A</i><b aria-hidden="true">↑</b><strong>+80,00 €</strong></span>
          <span class="landing-graphic__split-item landing-graphic__split-item--negative"><i aria-hidden="true">B</i><b aria-hidden="true">↓</b><strong>−40,00 €</strong></span>
          <span class="landing-graphic__split-item landing-graphic__split-item--negative"><i aria-hidden="true">C</i><b aria-hidden="true">↓</b><strong>−40,00 €</strong></span>
        </div>
        <p class="landing-graphic__caption">Guthaben und Schulden auf einen Blick</p>
      </li>

      <li class="landing-graphic__card landing-graphic__card--balance">
        <span class="landing-graphic__number" aria-hidden="true">3</span>
        <p class="landing-graphic__eyebrow">Ausgleich</p>
        <div class="landing-graphic__transfer">
          <span class="landing-graphic__person"><i aria-hidden="true">B</i>Ben</span>
          <span class="landing-graphic__arrow" aria-hidden="true">→</span>
          <strong>40,00 €</strong>
          <span class="landing-graphic__arrow" aria-hidden="true">→</span>
          <span class="landing-graphic__person"><i aria-hidden="true">A</i>Ava</span>
        </div>
        <p class="landing-graphic__caption">Ein klarer Vorschlag statt Kopfrechnen</p>
      </li>
    </ol>

    <a href="#in-drei-schritten" class="landing-graphic__next" :aria-label="t('home.graphic.next')">
      <AppIcon name="chevron-down" />
    </a>
  </figure>
</template>

<script setup lang="ts">
const { t } = useAppI18n()
const graphic = ref<HTMLElement | null>(null)
const desktopAnimationStarted = ref(false)
const mobileMotionEnabled = ref(false)

let visibilityObserver: IntersectionObserver | undefined
let desktopViewport: MediaQueryList | undefined
let mobileViewport: MediaQueryList | undefined
let reducedMotion: MediaQueryList | undefined
let desktopAnimationArmed = true
let mobileMotionFrame: number | undefined
let mobileMotionHasRendered = false
let previousMobileScrollTop = 0
const mobileCardCompleted = [false, false, false]
const mobileNumberAnimations: Array<Animation | undefined> = []

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function animateMobileNumber(card: HTMLElement, index: number): void {
  const number = card.querySelector<HTMLElement>('.landing-graphic__number')
  if (!number) return

  mobileNumberAnimations[index]?.cancel()
  mobileNumberAnimations[index] = number.animate([
    { offset: 0, scale: '1' },
    { offset: 0.38, scale: '1.22' },
    { offset: 0.68, scale: '1.08' },
    { offset: 1, scale: '1' },
  ], {
    duration: 1000,
    easing: 'cubic-bezier(0.22, 0.75, 0.25, 1)',
  })
}

function updateMobileMotion(): void {
  mobileMotionFrame = undefined

  if (!mobileMotionEnabled.value || !graphic.value) return

  const cards = Array.from(graphic.value.querySelectorAll<HTMLElement>('.landing-graphic__card'))
  if (cards.length !== 3) return

  const viewportHeight = window.innerHeight
  const startLine = viewportHeight * 0.92
  const quarterLine = viewportHeight * 0.25
  const rects = cards.map(card => card.getBoundingClientRect())
  const scrollTop = window.scrollY
  const mobileNavigation = document.querySelector<HTMLElement>('.mobile-bottom-navigation')
  const mobileNavigationRect = mobileNavigation?.getBoundingClientRect()
  const mobileNavigationStyle = mobileNavigation ? getComputedStyle(mobileNavigation) : undefined
  const visibleBottom = mobileNavigationRect
    && mobileNavigationStyle?.display !== 'none'
    && mobileNavigationStyle?.visibility !== 'hidden'
    && Number(mobileNavigationStyle?.opacity ?? 1) > 0.1
    && mobileNavigationRect.height > 0
    && mobileNavigationRect.top > 0
    && mobileNavigationRect.top < viewportHeight
    ? mobileNavigationRect.top
    : viewportHeight
  const cardDocumentTops = rects.map(rect => rect.top + scrollTop)
  const cardDocumentBottoms = rects.map(rect => rect.bottom + scrollTop)
  const animationStarts: number[] = []
  const animationEnds: number[] = []

  cards.forEach((_, index) => {
    const previousEnd = animationEnds[index - 1]
    const start = previousEnd ?? cardDocumentTops[index]! - startLine
    const isLastCard = index === cards.length - 1
    const finalCardLine = Math.min(visibleBottom, viewportHeight * 0.75)
    const nextBottom = cardDocumentBottoms[index + 1]
    const naturalEnd = isLastCard
      ? cardDocumentBottoms[index]! - finalCardLine
      : Math.min(
          cardDocumentTops[index]! - quarterLine,
          nextBottom! - visibleBottom,
        )

    animationStarts.push(start)
    animationEnds.push(Math.max(start + 1, naturalEnd))
  })

  cards.forEach((card, index) => {
    const start = animationStarts[index]!
    const end = animationEnds[index]!
    const borderProgress = clampProgress((scrollTop - start) / (end - start))
    const completed = borderProgress >= 1

    card.style.setProperty('--overview-border-value', `${borderProgress * 100}%`)

    if (
      completed
      && !mobileCardCompleted[index]
      && mobileMotionHasRendered
      && scrollTop >= previousMobileScrollTop
    ) {
      animateMobileNumber(card, index)
    }
    mobileCardCompleted[index] = completed
  })

  const flowProgress = clampProgress(
    (scrollTop - animationStarts[0]!) / (animationEnds[2]! - animationStarts[0]!),
  )
  graphic.value.style.setProperty('--overview-flow-progress', `${flowProgress}`)
  mobileMotionHasRendered = true
  previousMobileScrollTop = scrollTop
}

function scheduleMobileMotion(): void {
  if (!mobileMotionEnabled.value || mobileMotionFrame !== undefined) return
  mobileMotionFrame = window.requestAnimationFrame(updateMobileMotion)
}

function clearMobileMotion(): void {
  if (!graphic.value) return

  graphic.value.style.removeProperty('--overview-flow-progress')
  graphic.value.querySelectorAll<HTMLElement>('.landing-graphic__card').forEach((card) => {
    card.style.removeProperty('--overview-border-value')
  })
  mobileNumberAnimations.forEach(animation => animation?.cancel())
  mobileCardCompleted.fill(false)
  mobileMotionHasRendered = false
}

function syncMobileMotion(): void {
  mobileMotionEnabled.value = Boolean(
    graphic.value
    && mobileViewport?.matches
    && !reducedMotion?.matches,
  )

  if (!mobileMotionEnabled.value) {
    clearMobileMotion()
    return
  }

  nextTick(scheduleMobileMotion)
}

function observeDesktopVisibility(): void {
  visibilityObserver?.disconnect()
  visibilityObserver = undefined

  if (
    !graphic.value
    || !window.matchMedia('(min-width: 40rem)').matches
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    desktopAnimationStarted.value = false
    desktopAnimationArmed = true
    return
  }

  visibilityObserver = new IntersectionObserver(([entry]) => {
    if (!entry) return

    if (!entry.isIntersecting || entry.intersectionRatio <= 0.15) {
      desktopAnimationStarted.value = false
      desktopAnimationArmed = true
      return
    }

    if (!desktopAnimationArmed || entry.intersectionRatio < 0.6) return

    desktopAnimationStarted.value = true
    desktopAnimationArmed = false
  }, { threshold: [0, 0.15, 0.6] })

  visibilityObserver.observe(graphic.value)
}

onMounted(() => {
  desktopViewport = window.matchMedia('(min-width: 40rem)')
  mobileViewport = window.matchMedia('(max-width: 39.999rem)')
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  desktopViewport.addEventListener('change', observeDesktopVisibility)
  mobileViewport.addEventListener('change', syncMobileMotion)
  reducedMotion.addEventListener('change', observeDesktopVisibility)
  reducedMotion.addEventListener('change', syncMobileMotion)
  window.addEventListener('scroll', scheduleMobileMotion, { passive: true })
  window.addEventListener('resize', scheduleMobileMotion)
  observeDesktopVisibility()
  syncMobileMotion()
})

onBeforeUnmount(() => {
  visibilityObserver?.disconnect()
  desktopViewport?.removeEventListener('change', observeDesktopVisibility)
  mobileViewport?.removeEventListener('change', syncMobileMotion)
  reducedMotion?.removeEventListener('change', observeDesktopVisibility)
  reducedMotion?.removeEventListener('change', syncMobileMotion)
  window.removeEventListener('scroll', scheduleMobileMotion)
  window.removeEventListener('resize', scheduleMobileMotion)
  if (mobileMotionFrame !== undefined) window.cancelAnimationFrame(mobileMotionFrame)
  mobileNumberAnimations.forEach(animation => animation?.cancel())
})
</script>
