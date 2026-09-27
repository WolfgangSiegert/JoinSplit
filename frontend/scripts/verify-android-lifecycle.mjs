const cdpUrl = process.env.JOIN_SPLIT_ANDROID_CDP_URL ?? 'http://127.0.0.1:9222'
const phase = process.env.JOIN_SPLIT_ANDROID_LIFECYCLE_PHASE ?? 'seed'

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
  check(await evaluate(`(() => {
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
  })()`), `Field not found: ${label}`)
}

async function selectByLabel(label, optionLabel) {
  check(await evaluate(`(() => {
    const normalize = ${normalizedText}
    const labelElement = [...document.querySelectorAll('label')]
      .find(item => normalize(item.textContent ?? '').startsWith(${JSON.stringify(label)}))
    const labelledField = labelElement?.querySelector('select')
      ?? (labelElement?.htmlFor ? document.getElementById(labelElement.htmlFor) : null)
    const field = labelledField instanceof HTMLSelectElement ? labelledField : null
    if (!field) return false
    const option = [...field.options].find(item => normalize(item.textContent ?? '') === ${JSON.stringify(optionLabel)})
    if (!option) return false
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, option.value)
    field.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`), `Select option not found: ${label} / ${optionLabel}`)
}

async function clickControl(name) {
  check(await evaluate(`(() => {
    const normalize = ${normalizedText}
    const control = [...document.querySelectorAll('button, a')]
      .find(item => normalize(item.getAttribute('aria-label') ?? item.textContent ?? '') === ${JSON.stringify(name)})
    if (!control) return false
    control.click()
    return true
  })()`), `Control not found: ${name}`)
}

async function durableState() {
  return evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('joinsplit')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(['groups', 'participants', 'expenses', 'settlements', 'pendingMutations'])
      const stores = ['groups', 'participants', 'expenses', 'settlements', 'pendingMutations']
      const requests = Object.fromEntries(stores.map(name => [name, transaction.objectStore(name).getAll()]))
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve(Object.fromEntries(stores.map(name => [name, requests[name].result])))
    }
  })`)
}

async function waitForStoreCount(store, count, label) {
  await waitFor(`new Promise((resolve, reject) => {
    const request = indexedDB.open('joinsplit')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const countRequest = request.result.transaction(${JSON.stringify(store)}).objectStore(${JSON.stringify(store)}).count()
      countRequest.onerror = () => reject(countRequest.error)
      countRequest.onsuccess = () => resolve(countRequest.result === ${count})
    }
  })`, label)
}

try {
  await command('Runtime.enable')
  await command('Page.enable')
  check(await evaluate(`location.origin`) === 'https://localhost', 'The native bundled origin is not active')
  check(await evaluate(`navigator.serviceWorker.getRegistrations().then(items => items.length)`) === 0, 'A Service Worker is active')

  if (phase === 'seed') {
    let state = await durableState()
    let group = state.groups.find(item => item.name === 'Android Offline Lifecycle')
    check(state.groups.length === (group ? 1 : 0), 'Unrelated local Groups make the isolated lifecycle result ambiguous')

    if (!group) {
      await navigate('/groups/new')
      await fill('Gruppenname', 'Android Offline Lifecycle')
      await fill('Mein Name in dieser Gruppe', 'Alice Android')
      await clickControl('Gruppe erstellen')
      await waitFor(`/^\\/groups\\/[0-9a-f-]{36}$/u.test(location.pathname)`, 'local Group creation')
      await waitForStoreCount('groups', 1, 'persisted local Group')
      await waitForStoreCount('participants', 1, 'persisted initial Participant')
      state = await durableState()
      group = state.groups.find(item => item.name === 'Android Offline Lifecycle')
    }

    check(group, 'Lifecycle test Group is missing')
    const groupId = group.id

    if (!state.participants.some(item => item.name === 'Bob Android')) {
      await navigate(`/groups/${groupId}/participants`)
      await fill('Teilnehmer hinzufügen', 'Bob Android')
      await clickControl('Hinzufügen')
      await waitForStoreCount('participants', 2, 'persisted second Participant')
      state = await durableState()
    }

    if (!state.expenses.some(item => item.description === 'Offline Unterkunft')) {
      await navigate(`/groups/${groupId}/expenses/new`)
      await fill('Beschreibung', 'Offline Unterkunft')
      await fill('Betrag in Euro', '10,00')
      await selectByLabel('Bezahlt von', 'Alice Android')
      await clickControl('Ausgabe speichern')
      await waitForStoreCount('expenses', 1, 'persisted Expense')
      state = await durableState()
    }

    if (state.settlements.length === 0) {
      await navigate(`/groups/${groupId}/settlements/new`)
      await selectByLabel('Gezahlt von', 'Bob Android')
      await selectByLabel('Gezahlt an', 'Alice Android')
      await fill('Betrag in Euro', '2,00')
      await clickControl('Zahlung speichern')
      await waitForStoreCount('settlements', 1, 'persisted Settlement')
    }

    state = await durableState()
    check(state.groups.length === 1 && state.participants.length === 2, 'Local Group or Participants are missing')
    check(state.expenses.length === 1 && state.settlements.length === 1, 'Local financial records are missing')
    const pendingTypes = [...state.pendingMutations]
      .sort((left, right) => left.createdOrder - right.createdOrder)
      .map(item => item.type)
      .join(',')
    check(pendingTypes === 'CreateGroup,AddParticipant,CreateExpense,CreateSettlement', `Unexpected pending mutation order: ${pendingTypes}`)
    console.log(JSON.stringify({ outcome: 'passed', phase, groupId, pending: state.pendingMutations.length }))
  } else {
    const state = await durableState()
    const group = state.groups.find(item => item.name === 'Android Offline Lifecycle')
    check(group && state.participants.length === 2 && state.expenses.length === 1 && state.settlements.length === 1, 'Durable native state did not survive relaunch')
    await navigate(`/groups/${group.id}/balances`)
    check((await evaluate(`document.body.textContent`)).includes('3,00'), 'Expected computed balance is not visible after relaunch')

    if (phase === 'reconnect') {
      await evaluate(`window.dispatchEvent(new Event('online'))`)
      await waitFor(`new Promise((resolve, reject) => {
        const request = indexedDB.open('joinsplit')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const count = request.result.transaction('pendingMutations').objectStore('pendingMutations').count()
          count.onerror = () => reject(count.error)
          count.onsuccess = () => resolve(count.result === 0)
        }
      })`, 'pending mutation synchronization', 60_000)
      await evaluate(`window.dispatchEvent(new Event('online'))`)
    } else {
      check(state.pendingMutations.length === 4, 'Pending mutations did not survive offline relaunch')
    }

    const after = await durableState()
    check(after.groups.length === 1 && after.participants.length === 2 && after.expenses.length === 1 && after.settlements.length === 1, 'Reconnect duplicated or removed local records')
    console.log(JSON.stringify({ outcome: 'passed', phase, groupId: group.id, pending: after.pendingMutations.length }))
  }
} catch (error) {
  console.error(JSON.stringify({ outcome: 'failed', phase, error: String(error) }))
  process.exitCode = 1
} finally {
  socket.close()
}
