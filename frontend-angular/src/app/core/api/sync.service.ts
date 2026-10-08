import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AccessIdentity, Expense, PendingMutation } from '../domain/models';
import { WorkspaceStore } from '../state/workspace.store';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(WorkspaceStore);
  readonly running = signal(false);
  readonly message = signal('');

  async synchronize(): Promise<void> {
    if (this.running()) return;
    if (!navigator.onLine) {
      this.message.set('Offline: Änderungen bleiben lokal gespeichert.');
      return;
    }
    this.running.set(true);
    this.message.set('Synchronisierung läuft …');
    try {
      let identity = this.store.identity();
      if (!identity) {
        this.message.set('Keine lokale Identität vorhanden.');
        return;
      }
      identity = await this.ensureRegistered(identity);
      const queue = [...this.store.state().pendingMutations].sort(
        (a, b) => a.createdOrder - b.createdOrder,
      );
      for (const mutation of queue) {
        await this.store.markMutation(mutation.id, 'syncing');
        try {
          await this.send(mutation, identity);
          await this.store.acknowledgeMutation(mutation.id, identity);
        } catch (error) {
          const message = humanError(error);
          await this.store.markMutation(mutation.id, 'failed', message);
          this.message.set(message);
          return;
        }
      }
      this.message.set(
        queue.length ? 'Alle Änderungen sind synchronisiert.' : 'Keine Änderungen ausstehend.',
      );
    } finally {
      this.running.set(false);
    }
  }

  private async ensureRegistered(identity: AccessIdentity): Promise<AccessIdentity> {
    if (identity.registered) return identity;
    await firstValueFrom(
      this.http.post('/api/access-identities', null, {
        headers: authHeaders(identity),
        observe: 'response',
      }),
    );
    const registered = { ...identity, registered: true };
    await this.store.updateIdentity(registered);
    return registered;
  }

  private async send(
    mutation: PendingMutation,
    identity: AccessIdentity,
  ): Promise<HttpResponse<unknown>> {
    const headers = authHeaders(identity)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json');
    const groupUrl = `/api/groups/${mutation.groupId}`;
    switch (mutation.type) {
      case 'CreateGroup':
        return firstValueFrom(
          this.http.post('/api/groups', mutation.payload, { headers, observe: 'response' }),
        );
      case 'ArchiveGroup':
      case 'ReactivateGroup':
        return firstValueFrom(
          this.http.patch(groupUrl, mutation.payload, { headers, observe: 'response' }),
        );
      case 'DeleteGroup':
        return firstValueFrom(this.http.delete(groupUrl, { headers, observe: 'response' }));
      case 'AddParticipant':
        return firstValueFrom(
          this.http.post(`${groupUrl}/participants`, mutation.payload, {
            headers,
            observe: 'response',
          }),
        );
      case 'RenameParticipant':
      case 'DeactivateParticipant':
      case 'ReactivateParticipant': {
        const participantId = mutation.payload['participantId'];
        const body =
          mutation.type === 'RenameParticipant'
            ? { name: mutation.payload['name'] }
            : { active: mutation.payload['active'] };
        return firstValueFrom(
          this.http.patch(`${groupUrl}/participants/${participantId}`, body, {
            headers,
            observe: 'response',
          }),
        );
      }
      case 'DeleteParticipant':
        return firstValueFrom(
          this.http.delete(`${groupUrl}/participants/${mutation.payload['participantId']}`, {
            headers,
            observe: 'response',
          }),
        );
      case 'CreateExpense':
      case 'UpdateExpense': {
        const expense = mutation.payload['expense'] as Expense;
        const body = {
          ...(mutation.type === 'CreateExpense' ? { expenseId: expense.id } : {}),
          description: expense.description,
          amountMinor: expense.amountMinor,
          incurredOn: expense.incurredOn,
          payerParticipantId: expense.payerParticipantId,
          participantIds: expense.shares.map((share) => share.participantId),
        };
        const url =
          mutation.type === 'CreateExpense'
            ? `${groupUrl}/expenses`
            : `${groupUrl}/expenses/${expense.id}`;
        return firstValueFrom(
          mutation.type === 'CreateExpense'
            ? this.http.post(url, body, { headers, observe: 'response' })
            : this.http.put(url, body, { headers, observe: 'response' }),
        );
      }
      case 'DeleteExpense': {
        const expense = mutation.payload['expense'] as Expense;
        return firstValueFrom(
          this.http.delete(`${groupUrl}/expenses/${expense.id}`, { headers, observe: 'response' }),
        );
      }
      case 'CreateSettlement':
      case 'UpdateSettlement': {
        const settlement = mutation.payload['settlement'] as Record<string, string>;
        const body = {
          ...(mutation.type === 'CreateSettlement' ? { settlementId: settlement['id'] } : {}),
          senderParticipantId: settlement['senderParticipantId'],
          receiverParticipantId: settlement['receiverParticipantId'],
          amountMinor: settlement['amountMinor'],
          occurredOn: settlement['occurredOn'],
        };
        const url =
          mutation.type === 'CreateSettlement'
            ? `${groupUrl}/settlements`
            : `${groupUrl}/settlements/${settlement['id']}`;
        return firstValueFrom(
          mutation.type === 'CreateSettlement'
            ? this.http.post(url, body, { headers, observe: 'response' })
            : this.http.put(url, body, { headers, observe: 'response' }),
        );
      }
      case 'DeleteSettlement': {
        const settlement = mutation.payload['settlement'] as Record<string, string>;
        return firstValueFrom(
          this.http.delete(`${groupUrl}/settlements/${settlement['id']}`, {
            headers,
            observe: 'response',
          }),
        );
      }
    }
  }
}

function authHeaders(identity: AccessIdentity): HttpHeaders {
  return new HttpHeaders({
    'X-Access-Identity-ID': identity.id,
    Authorization: `Bearer ${identity.credential}`,
  });
}
function humanError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse))
    return 'Die Synchronisierung ist unerwartet fehlgeschlagen.';
  if (error.status === 0)
    return 'Der Laravel-Server ist nicht erreichbar. Die Daten bleiben lokal.';
  if (error.status === 409)
    return 'Der Server meldet einen Konflikt. Lokal wurde nichts überschrieben.';
  if (error.status === 410)
    return 'Die anonyme Serverkopie ist abgelaufen. Die Daten bleiben lokal.';
  if (error.status === 422) return 'Der Server hat die Änderung fachlich abgelehnt.';
  if (error.status === 401 || error.status === 403)
    return 'Die lokale Zugriffsidentität wurde nicht akzeptiert.';
  if (error.status === 429) return 'Zu viele Anfragen. Bitte später erneut synchronisieren.';
  return `Synchronisierung fehlgeschlagen (HTTP ${error.status}).`;
}
