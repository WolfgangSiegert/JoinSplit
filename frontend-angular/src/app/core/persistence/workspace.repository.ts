import { Injectable } from '@angular/core';
import { AccessIdentity, EMPTY_WORKSPACE, WorkspaceState } from '../domain/models';

const DATABASE = 'joinsplit-angular-learning';
const VERSION = 1;
const IDENTITY_STORE = 'accessIdentity';
const WORKSPACE_STORE = 'workspace';
const CURRENT = 'current';

@Injectable({ providedIn: 'root' })
export class WorkspaceRepository {
  async load(): Promise<{ identity: AccessIdentity | null; workspace: WorkspaceState }> {
    const database = await this.open();
    const transaction = database.transaction([IDENTITY_STORE, WORKSPACE_STORE], 'readonly');
    const [identity, workspace] = await Promise.all([
      request<AccessIdentity | undefined>(transaction.objectStore(IDENTITY_STORE).get(CURRENT)),
      request<WorkspaceState | undefined>(transaction.objectStore(WORKSPACE_STORE).get(CURRENT)),
    ]);
    await complete(transaction);
    database.close();
    return { identity: identity ?? null, workspace: workspace ?? EMPTY_WORKSPACE };
  }
  async save(identity: AccessIdentity, workspace: WorkspaceState): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction([IDENTITY_STORE, WORKSPACE_STORE], 'readwrite');
    transaction.objectStore(IDENTITY_STORE).put(identity, CURRENT);
    transaction.objectStore(WORKSPACE_STORE).put(workspace, CURRENT);
    await complete(transaction);
    database.close();
  }
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(DATABASE, VERSION);
      opening.onupgradeneeded = () => {
        const database = opening.result;
        if (!database.objectStoreNames.contains(IDENTITY_STORE))
          database.createObjectStore(IDENTITY_STORE);
        if (!database.objectStoreNames.contains(WORKSPACE_STORE))
          database.createObjectStore(WORKSPACE_STORE);
      };
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () =>
        reject(opening.error ?? new Error('IndexedDB konnte nicht geöffnet werden.'));
    });
  }
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB-Transaktion abgebrochen.'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB-Transaktion fehlgeschlagen.'));
  });
}
