import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

interface BrowserDurableSnapshot {
  identityId: string | null
  credentialIsIsolated: boolean
  groups: Array<{ id: string; participantIds: string[] }>
  participants: Array<{ id: string; groupId: string }>
  pendingGroupIds: string[]
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(accessibility.violations).toEqual([])
}

async function openCreateGroup(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('link', { name: 'Neue Gruppe' }).click()
}

async function durableSnapshot(page: Page): Promise<BrowserDurableSnapshot> {
  return page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = db.transaction(
      ['accessIdentity', 'groups', 'participants', 'pendingMutations', 'settings'],
      'readonly',
    )
    const getAll = <T>(storeName: string) => new Promise<T[]>((resolve, reject) => {
      const result = transaction.objectStore(storeName).getAll()
      result.onsuccess = () => resolve(result.result as T[])
      result.onerror = () => reject(result.error)
    })
    const [identities, groups, participants, pending, settings] = await Promise.all([
      getAll<{ id: string; credential: string }>('accessIdentity'),
      getAll<{ id: string; participantIds: string[] }>('groups'),
      getAll<{ id: string; groupId: string }>('participants'),
      getAll<{ groupId: string }>('pendingMutations'),
      getAll<unknown>('settings'),
    ])
    db.close()
    const nonIdentityState = JSON.stringify({ groups, participants, pending, settings })
    return {
      identityId: identities[0]?.id ?? null,
      credentialIsIsolated: identities[0]
        ? !nonIdentityState.includes(identities[0].credential)
          && !nonIdentityState.includes('credential')
        : false,
      groups,
      participants,
      pendingGroupIds: pending.map(record => record.groupId),
    }
  })
}

async function durableInitialParticipantDefault(page: Page): Promise<boolean | null> {
  return page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const result = db.transaction('settings').objectStore('settings').get('preferences')
    const record = await new Promise<{ addSelfAsParticipantByDefault?: unknown } | undefined>(
      (resolve, reject) => {
        result.onsuccess = () => resolve(result.result)
        result.onerror = () => reject(result.error)
      },
    )
    db.close()
    return typeof record?.addSelfAsParticipantByDefault === 'boolean'
      ? record.addSelfAsParticipantByDefault
      : null
  })
}

test('the ready Group List is accessible', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()
  await expectNoAxeViolations(page)
})

test('the durable global setting controls the next form default after reload', async ({ page }) => {
  await openCreateGroup(page)
  await page.getByRole('link', { name: 'Gruppen' }).click()
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  const setting = page.getByRole('checkbox', {
    name: 'Bei neuen Gruppen standardmäßig als Teilnehmer hinzufügen',
  })
  await setting.uncheck()
  await expect(setting).not.toBeChecked()
  await expect.poll(() => durableInitialParticipantDefault(page)).toBe(false)
  await page.reload()
  await expect(
    page.getByRole('checkbox', { name: 'Bei neuen Gruppen standardmäßig als Teilnehmer hinzufügen' }),
  ).not.toBeChecked()
  await page.getByRole('link', { name: 'Gruppen' }).click()
  await page.getByRole('link', { name: 'Neue Gruppe' }).click()

  await expect(page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' })).not.toBeChecked()
  await expect(page.getByLabel('Mein Name in dieser Gruppe')).toHaveCount(0)
})

test('a failed durable settings write restores the visible and effective value', async ({ page }) => {
  await page.goto('/settings')
  const setting = page.getByRole('checkbox', {
    name: 'Bei neuen Gruppen standardmäßig als Teilnehmer hinzufügen',
  })
  await expect(setting).toBeChecked()
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'settings') {
        throw new DOMException('Forced settings persistence failure', 'QuotaExceededError')
      }
      return Reflect.apply(originalPut, this, args)
    }
  })

  await setting.click()
  await expect(page.getByRole('alert')).toHaveText(
    'Die Einstellung konnte nicht lokal gespeichert werden.',
  )
  await expect(setting).toBeChecked()

  await page.getByRole('link', { name: 'Gruppen' }).click()
  await page.getByRole('link', { name: 'Neue Gruppe' }).click()
  await expect(page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' })).toBeChecked()
})

test('Create Group is reachable with the approved default and dependent field', async ({ page }) => {
  await openCreateGroup(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Gruppe erstellen' })).toBeVisible()
  const checkbox = page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' })
  await expect(checkbox).toBeChecked()
  await expect(page.getByLabel('Mein Name in dieser Gruppe')).toBeVisible()
  await expect(page.getByText('EUR', { exact: true })).toBeVisible()
  await expectNoAxeViolations(page)

  await checkbox.uncheck()
  await expect(page.getByLabel('Mein Name in dieser Gruppe')).toHaveCount(0)
})

test('validation preserves input, associates errors, and focuses the first invalid field', async ({ page }) => {
  await openCreateGroup(page)
  await page.getByLabel('Gruppenname').fill('   ')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Wolfgang')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()

  const groupName = page.getByLabel('Gruppenname')
  await expect(groupName).toBeFocused()
  await expect(groupName).toHaveValue('   ')
  await expect(groupName).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Gruppenname ist erforderlich.')).toBeVisible()
  await expectNoAxeViolations(page)

  await groupName.fill('Reise')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('   ')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await expect(page.getByLabel('Mein Name in dieser Gruppe')).toBeFocused()
})

test('local creation navigates immediately, then the real API confirms the same group idempotently', async ({ page }) => {
  await openCreateGroup(page)
  let releaseRequest!: () => void
  const requestGate = new Promise<void>(resolve => { releaseRequest = resolve })
  let capturedRequest: { body: string; headers: Record<string, string> } | undefined
  await page.route('**/api/groups', async route => {
    capturedRequest = {
      body: route.request().postData() ?? '',
      headers: await route.request().allHeaders(),
    }
    await requestGate
    await route.continue()
  })

  await page.getByLabel('Gruppenname').fill('  Wochenendtrip  ')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('  Wolfgang  ')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).dblclick()

  const heading = page.getByRole('heading', { level: 1, name: 'Wochenendtrip' })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]+\?created=1$/)
  await expect(page.getByText('Gruppe lokal erstellt.')).toBeVisible()
  await expect(page.getByText('Synchronisierung läuft. Die Gruppe bleibt lokal nutzbar.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Noch keine Ausgaben' })).toBeVisible()

  const groupId = new URL(page.url()).pathname.split('/').at(-1)!
  const serverResponsePromise = page.waitForResponse(
    response => response.url().endsWith('/api/groups') && response.request().method() === 'POST',
  )
  releaseRequest()
  const serverResponse = await serverResponsePromise
  expect(serverResponse.status()).toBe(201)
  await expect(page.getByText('Synchronisiert. Die Gruppe wurde vom Server bestätigt.')).toBeVisible()
  expect(JSON.parse(capturedRequest!.body).groupId).toBe(groupId)
  const snapshotBeforeReload = await durableSnapshot(page)
  const participantId = snapshotBeforeReload.participants[0]?.id
  expect(snapshotBeforeReload.groups[0]?.id).toBe(groupId)
  expect(participantId).toBeTruthy()
  expect(snapshotBeforeReload.pendingGroupIds).toEqual([])
  expect(snapshotBeforeReload.credentialIsIsolated).toBe(true)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Wochenendtrip' })).toBeVisible()
  const snapshotAfterReload = await durableSnapshot(page)
  expect(snapshotAfterReload.groups[0]?.id).toBe(groupId)
  expect(snapshotAfterReload.participants[0]?.id).toBe(participantId)
  expect(snapshotAfterReload.identityId).toBe(capturedRequest!.headers['x-access-identity-id'])
  await expectNoAxeViolations(page)

  let laterIdentityId = ''
  await page.route('**/api/groups', async route => {
    laterIdentityId = (await route.request().allHeaders())['x-access-identity-id'] ?? ''
    await route.continue()
  })
  await page.getByRole('link', { name: 'Gruppen' }).click()
  await page.getByRole('link', { name: 'Neue Gruppe' }).click()
  await page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' }).uncheck()
  await page.getByLabel('Gruppenname').fill('Zweite Gruppe')
  const laterResponse = page.waitForResponse(
    response => response.url().endsWith('/api/groups') && response.status() === 201,
  )
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await laterResponse
  expect(laterIdentityId).toBe(snapshotBeforeReload.identityId)

  const retryResponse = await page.request.post('http://127.0.0.1:8001/api/groups', {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Access-Identity-ID': capturedRequest!.headers['x-access-identity-id']!,
      Authorization: capturedRequest!.headers.authorization!,
    },
    data: JSON.parse(capturedRequest!.body),
  })
  expect(retryResponse.status()).toBe(200)
  expect((await retryResponse.json()).data.group.id).toBe(groupId)

  await page.getByRole('link', { name: 'Gruppen' }).click()
  await expect(page.getByRole('link', { name: /Wochenendtrip/ })).toHaveCount(1)
})

test('creation without a participant succeeds and offline is distinct from pending', async ({ page, context }) => {
  await openCreateGroup(page)
  await page.goto('/groups/preload')
  await expect(page.getByRole('heading', { level: 1, name: 'Gruppe nicht gefunden' })).toBeVisible()
  await page.getByRole('link', { name: 'Zur Gruppenliste' }).click()
  await page.getByRole('link', { name: 'Neue Gruppe' }).click()
  await context.setOffline(true)
  await page.getByRole('checkbox', { name: 'Mich als Teilnehmer hinzufügen' }).uncheck()
  await page.getByLabel('Gruppenname').fill('Ohne Teilnehmer')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Ohne Teilnehmer' })).toBeFocused()
  await expect(page.getByText('Offline. Die Gruppe bleibt lokal nutzbar und wird später synchronisiert.')).toBeVisible()
  await expectNoAxeViolations(page)

  const reconnectResponse = page.waitForResponse(
    response => response.url().endsWith('/api/groups') && response.status() === 201,
  )
  await context.setOffline(false)
  await reconnectResponse
  await expect(page.getByText('Synchronisiert. Die Gruppe wurde vom Server bestätigt.')).toBeVisible()

  await page.getByRole('link', { name: 'Gruppen' }).click()
  await expect(page.getByRole('link', { name: /Ohne Teilnehmer/ })).toHaveCount(1)
})

test('a failed request keeps the local group and retries the identical operation', async ({ page }) => {
  await openCreateGroup(page)
  const requestBodies: string[] = []
  const recordRequest = (request: import('@playwright/test').Request) => {
    if (request.url().endsWith('/api/groups') && request.method() === 'POST') {
      requestBodies.push(request.postData() ?? '')
    }
  }
  page.on('request', recordRequest)
  await page.route('**/api/groups', route => route.abort('connectionrefused'))

  await page.getByLabel('Gruppenname').fill('Retry-Reise')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Wolfgang')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()

  const heading = page.getByRole('heading', { level: 1, name: 'Retry-Reise' })
  await expect(heading).toBeVisible()
  await expect(page.getByText('Der Server ist derzeit nicht erreichbar. Die Gruppe bleibt lokal nutzbar.')).toBeVisible()
  const retry = page.getByRole('button', { name: 'Synchronisierung erneut versuchen' })
  await expect(retry).toBeVisible()
  await expectNoAxeViolations(page)

  await page.unroute('**/api/groups')
  const successResponse = page.waitForResponse(
    response => response.url().endsWith('/api/groups') && response.status() === 201,
  )
  await retry.click()
  await successResponse

  await expect(page.getByText('Synchronisiert. Die Gruppe wurde vom Server bestätigt.')).toBeVisible()
  expect(requestBodies).toHaveLength(2)
  expect(requestBodies[1]).toBe(requestBodies[0])
  const groupId = new URL(page.url()).pathname.split('/').at(-1)
  expect(JSON.parse(requestBodies[1]!).groupId).toBe(groupId)
  await expectNoAxeViolations(page)
})

test('network-blocked creation survives reload and resumes the same mutation without duplicates', async ({ page }) => {
  await openCreateGroup(page)
  await page.route('**/api/groups', route => route.abort('connectionrefused'))
  await page.getByLabel('Gruppenname').fill('Offline-Reise')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Wolfgang')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Offline-Reise' })).toBeVisible()
  await expect(page.getByText(
    'Der Server ist derzeit nicht erreichbar. Die Gruppe bleibt lokal nutzbar.',
  )).toBeVisible()

  const beforeReload = await durableSnapshot(page)
  const groupId = beforeReload.groups[0]!.id
  const participantId = beforeReload.participants[0]!.id
  expect(beforeReload.pendingGroupIds).toEqual([groupId])

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Offline-Reise' })).toBeVisible()
  const afterReload = await durableSnapshot(page)
  expect(afterReload.groups[0]?.id).toBe(groupId)
  expect(afterReload.participants[0]?.id).toBe(participantId)
  expect(afterReload.pendingGroupIds).toEqual([groupId])
  await expect(page.getByRole('button', { name: 'Synchronisierung erneut versuchen' })).toBeVisible()

  const synchronized = page.waitForResponse(
    response => response.url().endsWith('/api/groups') && response.status() === 201,
  )
  await page.unroute('**/api/groups')
  await page.getByRole('button', { name: 'Synchronisierung erneut versuchen' }).click()
  const response = await synchronized
  const requestBody = response.request().postDataJSON()
  expect(requestBody.groupId).toBe(groupId)
  expect(requestBody.initialParticipant.participantId).toBe(participantId)
  await expect(page.getByText('Synchronisiert. Die Gruppe wurde vom Server bestätigt.')).toBeVisible()
  expect((await durableSnapshot(page)).pendingGroupIds).toEqual([])

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Offline-Reise' })).toBeVisible()
  expect((await durableSnapshot(page)).pendingGroupIds).toEqual([])
  await page.waitForLoadState('networkidle')

  const retry = await page.request.post('http://127.0.0.1:8001/api/groups', {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Access-Identity-ID': response.request().headers()['x-access-identity-id']!,
      Authorization: response.request().headers().authorization!,
    },
    data: requestBody,
  })
  expect(retry.status()).toBe(200)
  const retryBody = await retry.json()
  expect(retryBody.data.group.id).toBe(groupId)
  expect(retryBody.data.initialParticipant.id).toBe(participantId)
  await expectNoAxeViolations(page)
})

test('the server-rendered hydration state is blocked and accessible', async ({ page }) => {
  await page.route('**/_nuxt/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '',
  }))
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Lokale Daten werden geladen' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Neue Gruppe' })).toHaveCount(0)
  await expect(page.getByText('Noch keine Gruppe')).toHaveCount(0)
  await expectNoAxeViolations(page)
})

test('malformed durable data blocks domain UI without deleting the record', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Neue Gruppe' })).toBeVisible()
  await page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = db.transaction('groups', 'readwrite')
    transaction.objectStore('groups').put({
      id: '99999999-9999-4999-8999-999999999999',
      name: '',
      currency: 'EUR',
      ownerAccessIdentityId: '99999999-9999-4999-8999-999999999999',
      status: 'active',
      participantIds: [],
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  })

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Lokale Daten nicht verfügbar' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Neue Gruppe' })).toHaveCount(0)
  const malformedStillExists = await page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const result = db.transaction('groups').objectStore('groups')
      .get('99999999-9999-4999-8999-999999999999')
    const record = await new Promise<unknown>((resolve, reject) => {
      result.onsuccess = () => resolve(result.result)
      result.onerror = () => reject(result.error)
    })
    db.close()
    return Boolean(record)
  })
  expect(malformedStillExists).toBe(true)
  await expectNoAxeViolations(page)
})

test('v1 pending CreateGroup data upgrades atomically through v4', async ({ page }) => {
  await page.route('**/_nuxt/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await page.goto('/')
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('joinsplit')
      deletion.onsuccess = () => resolve(); deletion.onerror = () => reject(deletion.error)
    })
    const request = indexedDB.open('joinsplit', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const database = request.result
        database.createObjectStore('accessIdentity', { keyPath: 'key' })
        database.createObjectStore('groups', { keyPath: 'id' })
        database.createObjectStore('participants', { keyPath: 'id' })
        database.createObjectStore('pendingMutations', { keyPath: 'groupId' })
        database.createObjectStore('settings', { keyPath: 'key' })
      }
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const actorId = '11111111-1111-4111-8111-111111111111'
    const groupId = '22222222-2222-4222-8222-222222222222'
    const tx = db.transaction(['accessIdentity', 'groups', 'pendingMutations'], 'readwrite')
    tx.objectStore('accessIdentity').add({ key: 'current', id: actorId, credential: '01'.repeat(32) })
    tx.objectStore('groups').add({ id: groupId, name: 'Migration', currency: 'EUR', ownerAccessIdentityId: actorId, status: 'active', participantIds: [] })
    tx.objectStore('pendingMutations').add({ groupId, kind: 'CreateGroup', status: 'pending', payload: { groupId, name: 'Migration', currency: 'EUR', actorId, initialParticipant: null } })
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    db.close()
  })
  await page.unroute('**/_nuxt/**')
  await page.route('**/api/groups', route => route.abort('connectionrefused'))
  await page.reload()
  await expect(page.getByRole('link', { name: /Migration/ })).toBeVisible()
  const upgraded = await page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const result = db.transaction('pendingMutations').objectStore('pendingMutations').getAll()
    const records = await new Promise<Record<string, unknown>[]>((resolve, reject) => { result.onsuccess = () => resolve(result.result); result.onerror = () => reject(result.error) })
    const version = db.version; db.close(); return { version, records }
  })
  expect(upgraded.version).toBe(4)
  expect(upgraded.records).toHaveLength(1)
  expect(upgraded.records[0]).toMatchObject({ type: 'CreateGroup', createdOrder: 0, groupId: '22222222-2222-4222-8222-222222222222' })
  expect(upgraded.records[0]?.id).toMatch(/^[0-9a-f-]{36}$/)
})

test('a fresh database is created directly at schema v4', async ({ page }) => {
  await page.goto('/')
  const schema = await page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const result = { version: db.version, stores: [...db.objectStoreNames] }
    db.close()
    return result
  })
  expect(schema.version).toBe(4)
  expect(schema.stores).toEqual(expect.arrayContaining(['accessIdentity', 'groups', 'participants', 'pendingMutations', 'settings', 'expenses', 'expenseShares', 'settlements']))
})

test('v3 settings upgrade to v4 preserves existing preferences and adds the Settlement default', async ({ page }) => {
  await page.route('**/_nuxt/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await page.goto('/')
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('joinsplit')
      deletion.onsuccess = () => resolve(); deletion.onerror = () => reject(deletion.error)
    })
    const request = indexedDB.open('joinsplit', 3)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const database = request.result
        database.createObjectStore('accessIdentity', { keyPath: 'key' })
        database.createObjectStore('groups', { keyPath: 'id' })
        database.createObjectStore('participants', { keyPath: 'id' })
        database.createObjectStore('pendingMutations', { keyPath: 'id' })
        database.createObjectStore('settings', { keyPath: 'key' })
        database.createObjectStore('expenses', { keyPath: 'id' })
        database.createObjectStore('expenseShares', { keyPath: ['expenseId', 'participantId'] })
      }
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const tx = db.transaction(['accessIdentity', 'settings'], 'readwrite')
    tx.objectStore('accessIdentity').add({ key: 'current', id: '11111111-1111-4111-8111-111111111111', credential: '01'.repeat(32) })
    tx.objectStore('settings').add({ key: 'preferences', addSelfAsParticipantByDefault: false })
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    db.close()
  })
  await page.unroute('**/_nuxt/**')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()
  const upgraded = await page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const settingsRequest = db.transaction('settings').objectStore('settings').get('preferences')
    const settings = await new Promise<Record<string, unknown>>((resolve, reject) => { settingsRequest.onsuccess = () => resolve(settingsRequest.result); settingsRequest.onerror = () => reject(settingsRequest.error) })
    const result = { version: db.version, stores: [...db.objectStoreNames], settings }
    db.close(); return result
  })
  expect(upgraded.version).toBe(4)
  expect(upgraded.stores).toContain('settlements')
  expect(upgraded.settings).toEqual({ key: 'preferences', addSelfAsParticipantByDefault: false, settlementProposalStrategy: 'deterministic' })
})

test('v2 durable state upgrades to v4 without losing existing records', async ({ page }) => {
  await page.route('**/_nuxt/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await page.goto('/')
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('joinsplit')
      deletion.onsuccess = () => resolve(); deletion.onerror = () => reject(deletion.error)
    })
    const request = indexedDB.open('joinsplit', 2)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const database = request.result
        database.createObjectStore('accessIdentity', { keyPath: 'key' })
        database.createObjectStore('groups', { keyPath: 'id' })
        database.createObjectStore('participants', { keyPath: 'id' })
        database.createObjectStore('pendingMutations', { keyPath: 'id' })
        database.createObjectStore('settings', { keyPath: 'key' })
      }
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const tx = db.transaction('accessIdentity', 'readwrite')
    tx.objectStore('accessIdentity').add({ key: 'current', id: '11111111-1111-4111-8111-111111111111', credential: '01'.repeat(32) })
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    db.close()
  })
  await page.unroute('**/_nuxt/**')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()
  const upgraded = await page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const identityRequest = db.transaction('accessIdentity').objectStore('accessIdentity').get('current')
    const identity = await new Promise<{ id: string }>((resolve, reject) => { identityRequest.onsuccess = () => resolve(identityRequest.result); identityRequest.onerror = () => reject(identityRequest.error) })
    const result = { version: db.version, stores: [...db.objectStoreNames], identityId: identity.id }
    db.close(); return result
  })
  expect(upgraded).toMatchObject({ version: 4, identityId: '11111111-1111-4111-8111-111111111111' })
  expect(upgraded.stores).toEqual(expect.arrayContaining(['expenses', 'expenseShares', 'settlements']))
})

test('Expense shares reload in stable Participant order despite opposing UUID order and archived Participants stay read-only', async ({ page }) => {
  const groupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const expenseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const stableFirst = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  const stableSecond = '00000000-0000-4000-8000-000000000001'
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Deine Gruppen' })).toBeVisible()
  await page.evaluate(async ({ groupId, expenseId, stableFirst, stableSecond }) => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const identityRequest = db.transaction('accessIdentity').objectStore('accessIdentity').get('current')
    const identity = await new Promise<{ id: string }>((resolve, reject) => { identityRequest.onsuccess = () => resolve(identityRequest.result); identityRequest.onerror = () => reject(identityRequest.error) })
    const tx = db.transaction(['groups', 'participants', 'expenses', 'expenseShares', 'pendingMutations'], 'readwrite')
    tx.objectStore('groups').clear(); tx.objectStore('participants').clear(); tx.objectStore('expenses').clear(); tx.objectStore('expenseShares').clear(); tx.objectStore('pendingMutations').clear()
    tx.objectStore('groups').put({ id: groupId, name: 'Archiv', currency: 'EUR', ownerAccessIdentityId: identity.id, status: 'archived', hasFinancialHistory: true, participantIds: [stableFirst, stableSecond] })
    tx.objectStore('participants').put({ id: stableFirst, groupId, name: 'Zuerst', status: 'inactive', order: 0 })
    tx.objectStore('participants').put({ id: stableSecond, groupId, name: 'Danach', status: 'active', order: 1 })
    tx.objectStore('expenses').put({ id: expenseId, groupId, description: 'Persistiert', amountMinor: 5, incurredOn: '2026-09-24', payerParticipantId: stableSecond, creatorAccessIdentityId: identity.id, splitMethod: 'equal' })
    tx.objectStore('expenseShares').put({ expenseId, participantId: stableSecond, amountMinor: 2 })
    tx.objectStore('expenseShares').put({ expenseId, participantId: stableFirst, amountMinor: 3 })
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    db.close()
  }, { groupId, expenseId, stableFirst, stableSecond })
  await page.goto(`/groups/${groupId}/expenses/${expenseId}`)
  await page.reload()
  const shares = page.locator('section[aria-labelledby="shares-title"] li')
  await expect(shares).toHaveCount(2)
  await expect(shares.nth(0)).toContainText('Zuerst')
  await expect(shares.nth(0)).toContainText('0,03')
  await expect(shares.nth(1)).toContainText('Danach')
  await page.goto(`/groups/${groupId}/participants`)
  await expect(page.getByText('Diese archivierte Gruppe ist schreibgeschützt. Teilnehmer können nur angesehen werden.')).toBeVisible()
  await expect(page.getByLabel('Teilnehmer hinzufügen')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /umbenennen|deaktivieren|löschen/i })).toHaveCount(0)
  await expectNoAxeViolations(page)
})

test('Expense create, Equal Split preview, edit, reload, and confirmed delete are accessible', async ({ page }) => {
  await openCreateGroup(page)
  await page.getByLabel('Gruppenname').fill('Ausgaben-Test')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Alice')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await expect(page.getByText('Synchronisiert. Die Gruppe wurde vom Server bestätigt.')).toBeVisible()
  await page.getByRole('link', { name: 'Teilnehmer verwalten' }).click()
  const addBob = page.waitForResponse(response => response.url().endsWith('/participants') && response.request().method() === 'POST' && response.status() === 201)
  await page.getByLabel('Teilnehmer hinzufügen').fill('Bob')
  await page.getByRole('button', { name: 'Hinzufügen' }).click()
  await addBob
  await page.getByRole('link', { name: '← Gruppe' }).click()
  await page.getByRole('link', { name: 'Ausgabe erfassen' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Ausgabe erfassen' })).toBeFocused()
  await page.getByLabel('Beschreibung').fill('Abendessen')
  await page.getByLabel('Betrag in Euro').fill('10,01')
  await page.getByLabel('Bezahlt von').selectOption({ label: 'Alice' })
  await expect(page.getByRole('heading', { name: 'Vorschau der Aufteilung' })).toBeVisible()
  await expect(page.getByText('5,01 €')).toBeVisible()
  await expect(page.getByText('5,00 €')).toBeVisible()
  const splitFieldset = page.getByRole('group', { name: 'Gleichmäßig aufteilen' })
  const aliceShare = page.getByRole('checkbox', { name: 'Alice' })
  await aliceShare.uncheck()
  await page.getByRole('checkbox', { name: 'Bob' }).uncheck()
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
  await expect(splitFieldset).toHaveAttribute('aria-invalid', 'true')
  await expect(splitFieldset).toHaveAttribute('aria-describedby', 'shares-help shares-error')
  await expect(page.getByRole('alert')).toHaveText('Mindestens eine Person für die Aufteilung auswählen.')
  await expect(aliceShare).toBeFocused()
  await expectNoAxeViolations(page)
  await aliceShare.check()
  await page.getByRole('checkbox', { name: 'Bob' }).check()
  await expectNoAxeViolations(page)
  const create = page.waitForResponse(response => response.url().endsWith('/expenses') && response.request().method() === 'POST' && response.status() === 201)
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
  await create
  await expect(page.getByRole('heading', { level: 1, name: 'Abendessen' })).toBeFocused()
  const expenseUrl = page.url()
  await page.reload()
  await expect(page.getByText('10,01 €')).toBeVisible()
  await page.getByRole('link', { name: /Ausgaben/ }).click()
  await page.getByRole('link', { name: 'Teilnehmer verwalten' }).click()
  const deactivate = page.waitForResponse(response => response.url().includes('/participants/') && response.request().method() === 'PATCH' && response.status() === 200)
  await page.getByRole('button', { name: 'Bob deaktivieren' }).click()
  await deactivate
  await page.goto(expenseUrl)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await expect(page.getByLabel('Beschreibung')).toBeFocused()
  const historicalBob = page.getByRole('checkbox', { name: 'Bob (inaktiv)' })
  await expect(historicalBob).toBeChecked()
  await expect(historicalBob).toBeEnabled()
  await historicalBob.uncheck()
  await page.getByLabel('Betrag in Euro').fill('10,02')
  const update = page.waitForResponse(response => response.url().includes('/expenses/') && response.request().method() === 'PUT' && response.status() === 200)
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await update
  await expect(page.getByRole('heading', { level: 1, name: 'Abendessen' })).toBeFocused()
  await expect(page.getByRole('definition').filter({ hasText: '10,02 €' })).toBeVisible()
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await expect(page.getByRole('checkbox', { name: 'Bob (inaktiv)' })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Bob (inaktiv)' })).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: 'Ausgabe löschen' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('Ausgabe „Abendessen“ endgültig löschen?')
  await expect(page.getByRole('button', { name: 'Abbrechen' })).toBeFocused()
  await expectNoAxeViolations(page)
  const deletion = page.waitForResponse(response => response.url().includes('/expenses/') && response.request().method() === 'DELETE' && response.status() === 204)
  await page.getByRole('button', { name: 'Endgültig löschen' }).click()
  await deletion
  await expect(page.getByText('Noch keine Ausgaben')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Noch keine Ausgaben')).toBeVisible()
  await expectNoAxeViolations(page)
})

test('a failed Expense delete stays actionable and ignores repeated activation', async ({ page }) => {
  await page.addInitScript(() => {
    const originalDelete = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function (key: IDBValidKey | IDBKeyRange): IDBRequest<undefined> {
      if (this.name === 'expenses' && localStorage.getItem('fail-expense-delete') === '1') {
        const attempts = Number(localStorage.getItem('expense-delete-attempts') ?? '0') + 1
        localStorage.setItem('expense-delete-attempts', String(attempts))
        throw new DOMException('Forced Expense delete failure', 'UnknownError')
      }
      return originalDelete.call(this, key)
    }
  })
  await openCreateGroup(page)
  await page.getByLabel('Gruppenname').fill('Delete-Härtung')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Alice')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await page.getByRole('link', { name: 'Ausgabe erfassen' }).click()
  await page.getByLabel('Beschreibung').fill('Fehlerhafte Löschung')
  await page.getByLabel('Betrag in Euro').fill('8,40')
  await page.getByRole('button', { name: 'Ausgabe speichern' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Fehlerhafte Löschung' })).toBeVisible()
  await page.evaluate(() => localStorage.setItem('fail-expense-delete', '1'))
  await page.getByRole('button', { name: 'Ausgabe löschen' }).click()

  const dialog = page.getByRole('alertdialog', { name: 'Ausgabe löschen' })
  const confirm = page.getByRole('button', { name: 'Endgültig löschen' })
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('dialog .danger-button')!
    button.click()
    button.click()
  })

  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveText('Die Ausgabe konnte nicht lokal gelöscht werden.')
  await expect(dialog).toHaveAttribute('aria-busy', 'false')
  await expect(confirm).toBeEnabled()
  await expect(confirm).toBeFocused()
  expect(await page.evaluate(() => localStorage.getItem('expense-delete-attempts'))).toBe('1')
  await expect(page.getByRole('heading', { level: 1, name: 'Fehlerhafte Löschung' })).toBeVisible()
})

test('Participant persistence failures are visibly and safely reported', async ({ page }) => {
  await openCreateGroup(page)
  await page.getByLabel('Gruppenname').fill('Persistenz-Test')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Alice')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await expect(page.getByText('Synchronisiert. Die Gruppe wurde vom Server bestätigt.')).toBeVisible()
  await page.getByRole('link', { name: 'Teilnehmer verwalten' }).click()
  await page.evaluate(() => {
    const originalAdd = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'participants') throw new DOMException('Forced participant failure', 'QuotaExceededError')
      return Reflect.apply(originalAdd, this, args)
    }
  })

  await page.getByLabel('Teilnehmer hinzufügen').fill('Bob')
  await page.getByRole('button', { name: 'Hinzufügen' }).click()
  await expect(page.getByRole('alert')).toHaveText('Der Teilnehmer konnte nicht lokal gespeichert werden.')
  await expect(page.getByText('Bob', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Forced participant failure')).toHaveCount(0)
  await expectNoAxeViolations(page)
})

test('Participant management is durable, FIFO synchronized, accessible, and keeps stable order', async ({ page }) => {
  await openCreateGroup(page)
  await page.getByLabel('Gruppenname').fill('Teilnehmer-Test')
  await page.getByLabel('Mein Name in dieser Gruppe').fill('Alice')
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
  await expect(page.getByText('Synchronisiert. Die Gruppe wurde vom Server bestätigt.')).toBeVisible()
  await page.getByRole('link', { name: 'Teilnehmer verwalten' }).click()
  await expect(page).toHaveURL(/\/participants$/)
  await expect(page.getByRole('heading', { name: 'Teilnehmer', exact: true })).toBeVisible()
  await expect(page.getByText('Alice', { exact: true })).toBeVisible()
  await expectNoAxeViolations(page)

  const methods: string[] = []
  page.on('request', request => { if (request.url().includes('/participants')) methods.push(request.method()) })
  let releasePost!: () => void
  const postGate = new Promise<void>(resolve => { releasePost = resolve })
  let observePost!: () => void
  const postObserved = new Promise<void>(resolve => { observePost = resolve })
  let postReleased = false
  await page.route('**/api/groups/*/participants*', async route => {
    if (route.request().method() === 'POST' && !postReleased) {
      observePost()
      await postGate
    }
    await route.continue()
  })
  await page.getByLabel('Teilnehmer hinzufügen').fill(' Bob ')
  await page.getByRole('button', { name: 'Hinzufügen' }).click()
  await postObserved
  await expect(page.getByText('Bob', { exact: true })).toBeVisible()
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Bob umbenennen' }).click()
  const renameInput = page.getByLabel('Neuer Name')
  await renameInput.fill('   ')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(renameInput).toHaveAttribute('aria-describedby', /rename-.+-error/)
  const renameErrorId = await renameInput.getAttribute('aria-describedby')
  await expect(page.locator(`#${renameErrorId}`)).toHaveText('Name ist erforderlich.')
  await expectNoAxeViolations(page)
  await page.getByLabel('Neuer Name').fill('Bobby')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Bobby', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bobby umbenennen' })).toBeFocused()
  await expectNoAxeViolations(page)
  await expect.poll(async () => page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const result = db.transaction('pendingMutations').objectStore('pendingMutations').getAll()
    const records = await new Promise<unknown[]>((resolve, reject) => { result.onsuccess = () => resolve(result.result); result.onerror = () => reject(result.error) })
    db.close(); return records.length
  })).toBe(2)
  expect(methods).toEqual(['POST'])

  const addResponse = page.waitForResponse(response => response.url().endsWith('/participants') && response.request().method() === 'POST' && response.status() === 201)
  const renameResponse = page.waitForResponse(response => response.url().includes('/participants/') && response.request().method() === 'PATCH' && response.status() === 200)
  postReleased = true
  releasePost()
  await addResponse
  await renameResponse
  expect(methods).toEqual(['POST', 'PATCH'])
  await page.unroute('**/api/groups/*/participants*')

  const addCarol = page.waitForResponse(response => response.url().endsWith('/participants') && response.request().method() === 'POST' && response.status() === 201)
  await page.getByLabel('Teilnehmer hinzufügen').fill('Carol')
  await page.getByRole('button', { name: 'Hinzufügen' }).click()
  const carolResponse = await addCarol
  expect(carolResponse.request().postDataJSON().order).toBe(2)

  const deactivate = page.waitForResponse(response => response.url().includes('/participants/') && response.request().method() === 'PATCH' && response.status() === 200)
  await page.getByRole('button', { name: 'Carol deaktivieren' }).click()
  await deactivate
  await expect(page.getByText('Inaktiv')).toBeVisible()
  await expectNoAxeViolations(page)
  await page.reload()
  await expect(page.getByText('Inaktiv')).toBeVisible()

  await page.getByRole('button', { name: 'Bobby löschen' }).click()
  await expect(page.getByRole('dialog')).toContainText('Teilnehmer „Bobby“ wirklich löschen?')
  await expectNoAxeViolations(page)
  const deletion = page.waitForResponse(response => response.url().includes('/participants/') && response.request().method() === 'DELETE' && response.status() === 204)
  await page.getByRole('button', { name: 'Endgültig löschen' }).click()
  await deletion
  await expect(page.getByText('Bobby', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Alice löschen' })).toBeFocused()
  await page.reload()
  await expect(page.getByText('Bobby', { exact: true })).toHaveCount(0)
  const orders = await page.evaluate(async () => {
    const request = indexedDB.open('joinsplit', 4)
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const result = db.transaction('participants').objectStore('participants').getAll()
    const records = await new Promise<Array<{ name: string; order: number }>>((resolve, reject) => { result.onsuccess = () => resolve(result.result); result.onerror = () => reject(result.error) })
    db.close(); return Object.fromEntries(records.map(item => [item.name, item.order]))
  })
  expect(orders).toMatchObject({ Alice: 0, Carol: 2 })
  await expectNoAxeViolations(page)
})
