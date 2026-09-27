import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const icon = await readFile(resolve(root, 'public/pwa-maskable-512x512.png'))
const iconData = `data:image/png;base64,${icon.toString('base64')}`
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ deviceScaleFactor: 1 })

async function renderIcon(relativePath, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#202b26}img{display:block;width:100%;height:100%}</style><img src="${iconData}" alt="">`)
  await page.screenshot({ path: resolve(root, relativePath) })
}

async function renderSplash(relativePath, width, height) {
  const iconSize = Math.round(Math.min(width, height) * 0.3)
  await page.setViewportSize({ width, height })
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fbf7ef}body{display:grid;place-items:center}img{display:block;width:${iconSize}px;height:${iconSize}px;border-radius:22%}</style><img src="${iconData}" alt="">`)
  await page.screenshot({ path: resolve(root, relativePath) })
}

await renderIcon('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024)

for (const [density, legacySize, foregroundSize] of [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
]) {
  await renderIcon(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`, legacySize)
  await renderIcon(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, legacySize)
  await renderIcon(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, foregroundSize)
}

for (const [directory, width, height] of [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
]) await renderSplash(`android/app/src/main/res/${directory}/splash.png`, width, height)

for (const filename of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await renderSplash(`ios/App/App/Assets.xcassets/Splash.imageset/${filename}`, 2732, 2732)
}

await browser.close()
console.log('Generated JoinSplit icons and splash assets for iOS and Android.')
