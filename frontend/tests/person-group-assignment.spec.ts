import { expect, test } from '@playwright/test'

const groupId = '91000000-0000-4000-8000-000000000001'
const personId = '91000000-0000-4000-8000-000000000002'
const existingGroupId = '91000000-0000-4000-8000-000000000003'
const existingPersonId = '91000000-0000-4000-8000-000000000004'
const existingParticipantId = '91000000-0000-4000-8000-000000000005'

test('a reusable Person can be added to a Group once and survives reload', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async ({ groupId, personId }) => {
    const request = indexedDB.open('joinsplit', 10)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    let identity: { id: string } | undefined
    for (let attempt = 0; attempt < 50 && !identity; attempt += 1) {
      const identityRequest = db.transaction('accessIdentity').objectStore('accessIdentity').get('current')
      identity = await new Promise<{ id: string } | undefined>((resolve, reject) => {
        identityRequest.onsuccess = () => resolve(identityRequest.result)
        identityRequest.onerror = () => reject(identityRequest.error)
      })
      if (!identity) await new Promise(resolve => setTimeout(resolve, 20))
    }
    if (!identity) throw new Error('Application identity was not initialized')
    const transaction = db.transaction(['groups', 'people'], 'readwrite')
    transaction.objectStore('groups').put({
      id: groupId, name: 'Hüttentour', currency: 'EUR', ownerAccessIdentityId: identity.id,
      status: 'active', hasFinancialHistory: false, participantIds: [],
    })
    transaction.objectStore('people').put({ id: personId, name: 'Ada Lovelace', status: 'active', revision: 0 })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }, { groupId, personId })

  await page.goto(`/groups/${groupId}/participants`)
  await page.getByRole('button', { name: 'Teilnehmeraufnahme öffnen' }).click()
  await page.getByLabel('Person', { exact: true }).selectOption(personId)
  await page.getByRole('button', { name: 'Ausgewählte Person als Teilnehmer hinzufügen' }).click()
  await expect(page.getByText('Ada Lovelace', { exact: true })).toBeVisible()
  await expect(page.getByText('Aktiv · Aus Personenverzeichnis')).toBeVisible()
  await expect(page.getByText('Alle aktiven Personen sind dieser Gruppe bereits als Teilnehmer zugeordnet.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Ada Lovelace', { exact: true })).toBeVisible()
  await expect(page.getByText('Aktiv · Aus Personenverzeichnis')).toBeVisible()
})

test('an existing Participant is linked and unlinked only through explicit actions', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async ({ groupId, personId, participantId }) => {
    const request = indexedDB.open('joinsplit', 10)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    let identity: { id: string } | undefined
    for (let attempt = 0; attempt < 50 && !identity; attempt += 1) {
      const identityRequest = db.transaction('accessIdentity').objectStore('accessIdentity').get('current')
      identity = await new Promise<{ id: string } | undefined>((resolve, reject) => {
        identityRequest.onsuccess = () => resolve(identityRequest.result)
        identityRequest.onerror = () => reject(identityRequest.error)
      })
      if (!identity) await new Promise(resolve => setTimeout(resolve, 20))
    }
    if (!identity) throw new Error('Application identity was not initialized')
    const transaction = db.transaction(['groups', 'participants', 'people'], 'readwrite')
    transaction.objectStore('groups').put({
      id: groupId, name: 'Altbestand', currency: 'EUR', ownerAccessIdentityId: identity.id,
      status: 'active', hasFinancialHistory: false, participantIds: [participantId],
    })
    transaction.objectStore('participants').put({
      id: participantId, groupId, name: 'Ada in Altbestand', status: 'active', order: 0,
    })
    transaction.objectStore('people').put({ id: personId, name: 'Ada im Verzeichnis', status: 'active', revision: 0 })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }, { groupId: existingGroupId, personId: existingPersonId, participantId: existingParticipantId })

  await page.goto(`/groups/${existingGroupId}/participants`)
  await page.getByLabel('Details zu Ada in Altbestand').click()
  await page.getByLabel('Bestehende Person verknüpfen').selectOption(existingPersonId)
  await page.getByRole('button', { name: 'Ausdrücklich verknüpfen' }).click()
  await expect(page.getByText('Mit „Ada im Verzeichnis“ im Personenverzeichnis verknüpft.')).toBeVisible()

  await page.reload()
  await page.getByLabel('Details zu Ada in Altbestand').click()
  await expect(page.getByRole('button', { name: 'Verknüpfung von Ada in Altbestand lösen' })).toBeVisible()
  await page.getByRole('button', { name: 'Verknüpfung von Ada in Altbestand lösen' }).click()
  await expect(page.getByLabel('Bestehende Person verknüpfen')).toBeVisible()
  await expect(page.getByText('Ada in Altbestand', { exact: true })).toBeVisible()
})
