import { expect, test, type Locator, type Page } from '@playwright/test'

interface RevealState {
  animationName: string
  filter: string
  opacity: number
  scale: string
  translate: string
}

interface OverviewCardState {
  animationName: string
  borderLeftWidth: string
  borderProgress: number
  filter: string
  numberAnimationName: string
  numberScale: number
  opacity: number
}

async function revealState(locator: Locator): Promise<RevealState> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)

    return {
      animationName: style.animationName,
      filter: style.filter,
      opacity: Number(style.opacity),
      scale: style.scale,
      translate: style.translate,
    }
  })
}

async function overviewCardState(locator: Locator): Promise<OverviewCardState> {
  return locator.evaluate((element) => {
    const cardStyle = getComputedStyle(element)
    const borderStyle = getComputedStyle(element, '::after')
    const numberStyle = getComputedStyle(element.querySelector('.landing-graphic__number')!)

    return {
      animationName: borderStyle.animationName,
      borderLeftWidth: cardStyle.borderLeftWidth,
      borderProgress: Number(borderStyle.getPropertyValue('--overview-border-progress').replace('%', '')),
      filter: cardStyle.filter,
      numberAnimationName: numberStyle.animationName,
      numberScale: numberStyle.scale === 'none' ? 1 : Number(numberStyle.scale.split(' ')[0]),
      opacity: Number(cardStyle.opacity),
    }
  })
}

async function overviewFlowProgress(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const scale = getComputedStyle(element.querySelector('.landing-graphic__steps')!, '::after').scale
    if (scale === 'none') return 1

    return Number(scale.split(' ').at(-1))
  })
}

async function scrollTo(page: Page, top: number): Promise<void> {
  await page.evaluate(async (scrollTop) => {
    window.scrollTo(0, scrollTop)
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }, top)
}

async function openLanding(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Gemeinsam den Überblick behalten' })).toBeVisible()
}

test('landing overview highlights its three steps in sequence and reverses when scrolling back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openLanding(page)

  expect(await page.evaluate(() => CSS.supports('animation-timeline: view()'))).toBe(true)
  await expect(page.locator('.landing-hero')).toHaveCSS('opacity', '1')

  const graphic = page.locator('.landing-graphic')
  const cards = page.locator('.landing-graphic__card')
  await expect(graphic).toHaveClass(/landing-graphic--mobile-motion/)
  const initialGraphic = await revealState(graphic)
  const initialCards = await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index))))
  expect(initialGraphic.opacity).toBe(1)
  expect(initialGraphic.filter).toBe('none')
  expect(['none', '1']).toContain(initialGraphic.scale)
  expect(initialCards.every(state => (
    state.opacity === 1
    && state.filter === 'none'
    && state.borderLeftWidth === '1px'
    && state.animationName === 'none'
    && state.numberAnimationName === 'none'
  ))).toBe(true)

  await page.locator('.landing-hero__guide-link').click()
  await page.waitForTimeout(800)
  const linkedCardStates = await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index))))
  expect(linkedCardStates[0]!.borderProgress).toBeGreaterThan(0)
  expect(linkedCardStates[0]!.borderProgress).toBeLessThan(100)
  expect(linkedCardStates[2]!.borderProgress).toBe(0)
  await scrollTo(page, 0)

  const finalScrollTop = await cards.nth(2).evaluate(element => (
    element.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.25
  ))
  const samples: Array<{ flowProgress: number, top: number, states: OverviewCardState[] }> = []
  for (let top = 0; top <= finalScrollTop + 20; top += 20) {
    await scrollTo(page, top)
    const states = await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index))))
    samples.push({ flowProgress: await overviewFlowProgress(graphic), top, states })
  }


  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index]!.flowProgress).toBeGreaterThanOrEqual(samples[index - 1]!.flowProgress - 0.001)
    for (let cardIndex = 0; cardIndex < 3; cardIndex += 1) {
      expect(samples[index]!.states[cardIndex]!.borderProgress)
        .toBeGreaterThanOrEqual(samples[index - 1]!.states[cardIndex]!.borderProgress - 0.1)
    }
    if (samples[index]!.states[0]!.borderProgress < 99) {
      expect(samples[index]!.states[1]!.borderProgress).toBeLessThanOrEqual(0.1)
    }
    if (samples[index]!.states[1]!.borderProgress < 99) {
      expect(samples[index]!.states[2]!.borderProgress).toBeLessThanOrEqual(0.1)
    }
  }

  const milestones = await cards.evaluateAll((elements) => {
    const scrollTop = window.scrollY
    const rects = elements.map(element => element.getBoundingClientRect())
    const navigation = document.querySelector<HTMLElement>('.mobile-bottom-navigation')
    const navigationRect = navigation?.getBoundingClientRect()
    const visibleBottom = navigationRect && navigationRect.top > 0 && navigationRect.top < window.innerHeight
      ? navigationRect.top
      : window.innerHeight
    const documentTops = rects.map(rect => rect.top + scrollTop)
    const documentBottoms = rects.map(rect => rect.bottom + scrollTop)
    const starts: number[] = []
    const ends: number[] = []

    elements.forEach((_, index) => {
      const start = ends[index - 1] ?? documentTops[index]! - window.innerHeight * 0.92
      const isLastCard = index === elements.length - 1
      const nextBottom = documentBottoms[index + 1]
      const naturalEnd = isLastCard
        ? documentBottoms[index]! - Math.min(visibleBottom, window.innerHeight * 0.75)
        : Math.min(
            documentTops[index]! - window.innerHeight * 0.25,
            nextBottom! - visibleBottom,
          )
      starts.push(start)
      ends.push(Math.max(start + 1, naturalEnd))
    })

    return { ends, visibleBottom }
  })

  await scrollTo(page, 0)
  await scrollTo(page, milestones.ends[0]! - 1)
  expect((await overviewCardState(cards.nth(0))).numberScale).toBeCloseTo(1, 2)
  await scrollTo(page, milestones.ends[0]! + 1)
  await expect.poll(async () => (await overviewCardState(cards.nth(0))).numberScale).toBeGreaterThan(1.1)
  expect(await cards.nth(0).locator('.landing-graphic__number').evaluate(element => (
    element.getAnimations()[0]?.effect?.getTiming().duration
  ))).toBe(1000)
  await page.waitForTimeout(1050)
  expect((await overviewCardState(cards.nth(0))).numberScale).toBeCloseTo(1, 2)
  expect((await overviewCardState(cards.nth(0))).borderProgress).toBeGreaterThanOrEqual(99)

  for (const index of [0, 1, 2]) {
    await scrollTo(page, milestones.ends[index]! + 1)

    await expect.poll(async () => (await overviewCardState(cards.nth(index))).borderProgress).toBeGreaterThanOrEqual(99)
    const endGeometry = await cards.nth(index).evaluate((element, values) => {
      const cards = Array.from(element.parentElement!.children) as HTMLElement[]
      const nextRect = cards[values.cardIndex + 1]?.getBoundingClientRect()
      const rect = element.getBoundingClientRect()
      const finalCardLine = Math.min(values.visibleBottom, window.innerHeight * 0.75)
      return {
        cardReachedQuarter: rect.top <= window.innerHeight * 0.25 + 1,
        lastCardReachedFinalLine: values.cardIndex === cards.length - 1
          && rect.bottom <= finalCardLine + 1
          && rect.top >= -1,
        nextCardFullyVisible: nextRect ? nextRect.bottom <= values.visibleBottom + 1 : false,
      }
    }, { cardIndex: index, visibleBottom: milestones.visibleBottom })
    if (index === 2) {
      expect(endGeometry.lastCardReachedFinalLine).toBe(true)
    } else {
      expect(endGeometry.cardReachedQuarter || endGeometry.nextCardFullyVisible).toBe(true)
    }
  }

  const thirdCardMidpoint = samples.find(sample => (
    sample.states[2]!.borderProgress > 10 && sample.states[2]!.borderProgress < 90
  ))
  expect(thirdCardMidpoint).toBeDefined()
  expect(samples.some(sample => sample.flowProgress > 0.1 && sample.flowProgress < 0.9)).toBe(true)

  await scrollTo(page, milestones.ends[2]! + 1)
  await expect.poll(async () => (await overviewCardState(cards.nth(2))).borderProgress).toBeGreaterThanOrEqual(99)
  expect((await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index)))))
    .every(state => state.borderProgress >= 99 && state.opacity === 1 && state.filter === 'none')).toBe(true)
  expect(await overviewFlowProgress(graphic)).toBeCloseTo(1, 2)

  await scrollTo(page, thirdCardMidpoint!.top)
  const reverseProgress = (await overviewCardState(cards.nth(2))).borderProgress
  expect(reverseProgress).toBeCloseTo(thirdCardMidpoint!.states[2]!.borderProgress, 0)
  expect(reverseProgress).toBeLessThan(100)
  expect((await revealState(graphic)).opacity).toBe(1)
})

test('landing overview triggers once and completes independently from scrolling on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openLanding(page)

  const graphic = page.locator('.landing-graphic')
  const cards = page.locator('.landing-graphic__card')
  const startStates = await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index))))
  expect(startStates[0]!.borderProgress).toBeLessThan(100)
  expect(startStates[1]!.borderProgress).toBe(0)
  expect(startStates[2]!.borderProgress).toBeLessThan(100)
  await expect(graphic).not.toHaveClass(/landing-graphic--desktop-play/)

  await scrollTo(page, 160)
  await expect(graphic).toHaveClass(/landing-graphic--desktop-play/)
  await page.waitForTimeout(500)

  const firstProgressBeforeReverseScroll = (await overviewCardState(cards.nth(0))).borderProgress
  expect(firstProgressBeforeReverseScroll).toBeGreaterThan(0)
  expect(firstProgressBeforeReverseScroll).toBeLessThan(100)
  expect((await overviewCardState(cards.nth(1))).borderProgress).toBe(0)

  await scrollTo(page, 0)
  await page.waitForTimeout(350)
  expect((await overviewCardState(cards.nth(0))).borderProgress).toBeGreaterThan(firstProgressBeforeReverseScroll)

  await page.waitForTimeout(2200)
  const sequenceMiddle = await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index))))
  expect(sequenceMiddle[0]!.borderProgress).toBe(100)
  expect(sequenceMiddle[1]!.borderProgress).toBeGreaterThan(0)
  expect(sequenceMiddle[1]!.borderProgress).toBeLessThan(100)
  expect(sequenceMiddle[2]!.borderProgress).toBe(0)

  await expect.poll(async () => (await overviewCardState(cards.nth(2))).borderProgress, { timeout: 10_000 }).toBe(100)
  expect((await page.locator('.landing-graphic__steps').evaluate(element => (
    getComputedStyle(element).gridTemplateColumns.split(' ').length
  )))).toBe(3)
  expect((await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index)))))
    .every(state => state.borderProgress === 100 && state.opacity === 1 && state.filter === 'none')).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0)
  expect(await cards.nth(1).evaluate(element => getComputedStyle(element, '::before').zIndex)).toBe('5')

  await scrollTo(page, 0)
  expect((await overviewCardState(cards.nth(2))).borderProgress).toBe(100)

  await scrollTo(page, await page.evaluate(() => document.documentElement.scrollHeight))
  await expect(graphic).not.toHaveClass(/landing-graphic--desktop-play/)

  await scrollTo(page, 160)
  await expect(graphic).toHaveClass(/landing-graphic--desktop-play/)
  await page.waitForTimeout(300)
  const upwardEntryStates = await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index))))
  expect(upwardEntryStates[0]!.borderProgress).toBeGreaterThan(0)
  expect(upwardEntryStates[0]!.borderProgress).toBeLessThan(100)
  expect(upwardEntryStates[1]!.borderProgress).toBe(0)
  expect(upwardEntryStates[2]!.borderProgress).toBe(0)
})

test('guide steps reveal in distinct scroll ranges and finish as a complete timeline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openLanding(page)

  const guide = page.locator('#in-drei-schritten')
  const steps = page.locator('.landing-guide__step')

  await guide.evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY
    window.scrollTo(0, top - window.innerHeight + 180)
  })

  await expect.poll(async () => (await revealState(steps.nth(0))).opacity).toBeGreaterThan(0.2)
  const enteringStates = await Promise.all([0, 1, 2].map(index => revealState(steps.nth(index))))
  expect(enteringStates[0]!.opacity).toBeGreaterThan(enteringStates[2]!.opacity)

  await guide.evaluate(element => element.scrollIntoView({ block: 'center' }))
  await expect.poll(async () => (await revealState(steps.nth(2))).opacity).toBe(1)
  expect((await Promise.all([0, 1, 2].map(index => revealState(steps.nth(index)))))
    .every(state => state.opacity === 1 && state.scale === '1' && state.filter.includes('blur(0px)'))).toBe(true)

  await page.evaluate(() => window.scrollBy(0, -280))
  await expect.poll(async () => (await revealState(steps.nth(2))).opacity).toBeLessThan(1)
})

test('direct links, keyboard focus, reduced motion and print keep the overview fully visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#so-funktionierts')

  const cards = page.locator('.landing-graphic__card')
  const directCardStates = await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index))))
  for (const state of directCardStates) {
    expect(state.animationName).toBe('none')
    expect(state.borderProgress).toBeGreaterThanOrEqual(99)
    expect(state.opacity).toBe(1)
    expect(state.filter).toBe('none')
  }

  await page.goto('/')
  await page.locator('.landing-graphic__next').focus()
  const focusCardStates = await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index))))
  expect(focusCardStates.every(state => state.animationName === 'none' && state.borderProgress >= 99)).toBe(true)

  await page.goto('/#in-drei-schritten')

  const directLinkStates = await Promise.all(
    (await page.locator('#in-drei-schritten .landing-section-heading, #in-drei-schritten li').all())
      .map(revealState),
  )
  expect(directLinkStates.every(state => state.opacity === 1 && state.animationName === 'none')).toBe(true)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  const reducedMotionStates = await Promise.all(
    (await page.locator(
      '.landing-graphic, .landing-graphic__card, .landing-graphic__number, .landing-workspace-card, .landing-section-heading, .landing-guide__step',
    ).all()).map(revealState),
  )
  expect(reducedMotionStates.every(state => (
    state.opacity === 1
    && state.animationName === 'none'
    && state.filter === 'none'
    && state.scale === '1'
  ))).toBe(true)
  expect((await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index)))))
    .every(state => state.animationName === 'none' && state.borderProgress >= 99)).toBe(true)

  await page.emulateMedia({ media: 'print', reducedMotion: 'no-preference' })
  await page.goto('/')
  expect((await Promise.all([0, 1, 2].map(index => overviewCardState(cards.nth(index)))))
    .every(state => state.animationName === 'none' && state.borderProgress >= 99 && state.opacity === 1)).toBe(true)
})
