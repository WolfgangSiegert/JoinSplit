const cdpUrl = process.env.JOIN_SPLIT_ANDROID_CDP_URL ?? 'http://127.0.0.1:9222'
const password = 'correct horse battery staple'
const email = `native-android-${Date.now()}@example.test`

function check(condition, message) {
  if (!condition) throw new Error(message)
}

const targets = await fetch(`${cdpUrl}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.url.startsWith('https://localhost'))
check(target?.webSocketDebuggerUrl, `No Android WebView page is available at ${cdpUrl}`)

const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
let sequence = 0

socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data))
  if (!message.id) return
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  if (message.error) request.reject(new Error(message.error.message))
  else request.resolve(message.result)
})

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

function command(method, params = {}) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function waitFor(expression, label, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function navigate(path) {
  await command('Page.navigate', { url: `https://localhost${path}` })
  await waitFor(`document.readyState === 'complete'`, `navigation to ${path}`)
}

const normalizedText = `value => value.replace(/\\s+/gu, ' ').trim()`

async function fill(label, value) {
  const result = await evaluate(`(() => {
    const normalize = ${normalizedText}
    const labelElement = [...document.querySelectorAll('label')]
      .find(item => normalize(item.textContent ?? '').startsWith(${JSON.stringify(label)}))
    const field = labelElement?.querySelector('input, textarea, select')
      ?? (labelElement?.htmlFor ? document.getElementById(labelElement.htmlFor) : null)
    if (!field) return false
    const prototype = field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, ${JSON.stringify(value)})
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  check(result, `Field not found: ${label}`)
}

async function clickControl(name) {
  const result = await evaluate(`(() => {
    const normalize = ${normalizedText}
    const control = [...document.querySelectorAll('button, a')]
      .find(item => normalize(item.getAttribute('aria-label') ?? item.textContent ?? '') === ${JSON.stringify(name)})
    if (!control) return false
    control.click()
    return true
  })()`)
  check(result, `Control not found: ${name}`)
}

async function waitForText(text) {
  await waitFor(`(() => {
    const normalize = ${normalizedText}
    return [...document.querySelectorAll('body *')]
      .some(item => normalize(item.textContent ?? '') === ${JSON.stringify(text)})
  })()`, `text: ${text}`)
}

async function waitForPendingPeopleToClear() {
  await waitFor(`new Promise((resolve, reject) => {
    const request = indexedDB.open('joinsplit')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const count = request.result.transaction('pendingPersonMutations').objectStore('pendingPersonMutations').count()
      count.onerror = () => reject(count.error)
      count.onsuccess = () => resolve(count.result === 0)
    }
  })`, 'the authenticated Person mutation queue to clear')
}

async function removePreviousSmokeAccount() {
  await navigate('/account')
  const previousSmokeAccount = await evaluate(`(() => {
    const heading = [...document.querySelectorAll('h2')].find(item => item.textContent?.trim() === 'Angemeldet')
    return Boolean(heading && document.body.textContent?.includes('native-android-'))
  })()`)
  if (!previousSmokeAccount) return

  await waitForPendingPeopleToClear()
  await fill('Passwort bestätigen', password)
  await clickControl('Account endgültig löschen')
  await waitFor(`location.pathname === '/'`, 'previous smoke Account deletion', 60_000)
}

async function inspectAccountStorage() {
  return evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('joinsplit')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const transaction = request.result.transaction(['accessIdentity', 'accountWorkspace'])
      const identity = transaction.objectStore('accessIdentity').get('current')
      const workspace = transaction.objectStore('accountWorkspace').get('current')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve({
        identityCredential: identity.result?.credential ?? null,
        workspaceKeys: Object.keys(workspace.result ?? {}),
        localStorageKeys: Object.keys(localStorage),
      })
    }
  })`)
}

async function invalidateAndRestoreSession() {
  const expiredStatus = await evaluate(`(async () => {
    const csrf = await fetch('https://joinsplit.tiny-bits.org/api/account/csrf', {
      credentials: 'include', headers: { Accept: 'application/json' },
    }).then(response => response.json())
    await fetch('https://joinsplit.tiny-bits.org/api/account/logout', {
      method: 'POST', credentials: 'include',
      headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrf.data.csrfToken },
    })
    return fetch('https://joinsplit.tiny-bits.org/api/account/workspace', {
      credentials: 'include', headers: { Accept: 'application/json' },
    }).then(response => response.status)
  })()`)
  check(expiredStatus === 401, `Expected an expired native session to return 401, received ${expiredStatus}`)

  const loginStatus = await evaluate(`(async () => {
    const csrf = await fetch('https://joinsplit.tiny-bits.org/api/account/csrf', {
      credentials: 'include', headers: { Accept: 'application/json' },
    }).then(response => response.json())
    return fetch('https://joinsplit.tiny-bits.org/api/account/login', {
      method: 'POST', credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf.data.csrfToken },
      body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }),
    }).then(response => response.status)
  })()`)
  check(loginStatus === 200, `Native session restoration failed with status ${loginStatus}`)
}

try {
  await command('Runtime.enable')
  await command('Page.enable')
  check(await evaluate(`location.origin`) === 'https://localhost', `Unexpected native origin: ${await evaluate(`location.href`)}`)
  check(await evaluate(`document.title`) === 'JoinSplit', `Unexpected document title: ${await evaluate(`document.title`)}`)
  check(await evaluate(`navigator.serviceWorker.getRegistrations().then(items => items.length)`) === 0, 'A Service Worker is active in the native container')

  await removePreviousSmokeAccount()

  await navigate('/people')
  const existingSmokePerson = await evaluate(`(() => {
    const text = document.body.textContent ?? ''
    if (text.includes('Ada Native Synced')) return 'synced'
    if (text.includes('Ada Native Android')) return 'android'
    return null
  })()`)
  if (!existingSmokePerson) {
    await fill('Name', 'Ada Native Android')
    await clickControl('Person anlegen')
    await waitForText('Ada Native Android')
  }

  await navigate('/account')
  await clickControl('Registrieren')
  await fill('E-Mail', email)
  await fill('Passwort', password)
  check(await evaluate(`(() => { const field = document.querySelector('input[type="checkbox"]'); if (!field) return false; field.click(); return field.checked })()`), 'Registration confirmation was not checked')
  await clickControl('Registrieren und Daten übernehmen')
  await waitFor(`location.pathname === '/'`, 'registration and adoption', 60_000)

  await navigate('/account')
  await waitForText('Angemeldet')
  await waitForText(email)

  await navigate('/people')
  if (existingSmokePerson !== 'synced') {
    await clickControl('Ada Native Android bearbeiten')
    await fill('Name', 'Ada Native Synced')
    await clickControl('Änderung speichern')
  }
  await waitForText('Ada Native Synced')
  await waitForPendingPeopleToClear()

  await navigate('/account')
  await clickControl('Abmelden')
  await waitFor(`location.pathname === '/'`, 'logout')

  await navigate('/account')
  await fill('E-Mail', email)
  await fill('Passwort', password)
  await clickControl('Anmelden und Daten übernehmen')
  await waitFor(`location.pathname === '/'`, 'login and device hydration', 60_000)
  await navigate('/people')
  await waitForText('Ada Native Synced')

  const storage = await inspectAccountStorage()
  check(storage.identityCredential === null, 'The Account-linked native identity exposes a credential in IndexedDB')
  check(storage.localStorageKeys.length === 0, 'The native Account flow wrote to localStorage')
  check(!storage.workspaceKeys.some(key => /password|session|token/iu.test(key)), 'Account session material appears in the durable workspace')

  await invalidateAndRestoreSession()

  await navigate('/account')
  await fill('Passwort bestätigen', password)
  await clickControl('Account endgültig löschen')
  await waitFor(`location.pathname === '/'`, 'Account deletion', 60_000)

  console.log(JSON.stringify({ outcome: 'passed', platform: 'android', origin: 'https://localhost', accountDeleted: true, serviceWorkers: 0, expiredSessionStatus: 401, accountSecretsInWebStorage: false }))
} catch (error) {
  console.error(JSON.stringify({ outcome: 'failed', platform: 'android', email, error: String(error) }))
  process.exitCode = 1
} finally {
  socket.close()
}
