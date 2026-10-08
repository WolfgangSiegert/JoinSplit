import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { calculateBalances, formatAmountMinor } from '../../core/domain/ledger';
import {
  proposeDeterministicSettlements,
  proposeMinimumTransferSettlements,
} from '../../core/domain/settlement-proposal';
import { SettlementStrategy } from '../../core/domain/models';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { GroupNavComponent } from '../../shared/group-nav.component';

@Component({
  imports: [RouterLink, GroupNavComponent],
  template: `
    <main class="page-shell">
      @if (group(); as current) {
        <p class="eyebrow">{{ current.name }}</p>
        <h1>Salden & Ausgleich</h1>
        <app-group-nav [groupId]="current.id" />
        <section class="section-stack" aria-labelledby="balances-heading">
          <div class="section-heading">
            <h2 id="balances-heading">Salden pro Teilnehmer</h2>
            <span>{{ balances().length }}</span>
          </div>
          <ul class="ledger-list">
            @for (balance of balances(); track balance.participantId; let index = $index) {
              <li class="ledger-row">
                <span class="avatar">{{
                  participantName(balance.participantId).slice(0, 1).toUpperCase()
                }}</span>
                <span
                  ><strong>{{ participantName(balance.participantId) }}</strong
                  ><small>{{ balanceLabel(balance.balanceAmountMinor) }}</small></span
                >
                <b
                  [class.positive]="isPositive(balance.balanceAmountMinor)"
                  [class.negative]="isNegative(balance.balanceAmountMinor)"
                  >{{ format(balance.balanceAmountMinor, true) }}</b
                >
              </li>
            }
          </ul>
        </section>
        <section class="proposal section-stack" aria-labelledby="proposal-heading">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Nächster Schritt</p>
              <h2 id="proposal-heading">So gleicht ihr aus</h2>
            </div>
          </div>
          <p class="notice">
            <strong>Noch nicht verbucht.</strong> Der Vorschlag ist eine Rechenhilfe, keine erfasste
            Zahlung.
          </p>
          <label
            >Strategie<select [value]="strategy()" (change)="changeStrategy($event)">
              <option value="deterministic">Einfacher deterministischer Ausgleich</option>
              <option value="minimum-transfer">Möglichst wenige Zahlungen</option>
            </select></label
          >
          @if (proposal().status === 'unavailable') {
            <p class="notice" role="status">
              Die exakte Strategie unterstützt höchstens 12 offene Salden; es wird nicht still auf
              Greedy zurückgefallen.
            </p>
          } @else if (proposal().status === 'invalid') {
            <p class="error" role="alert">Die Salden sind inkonsistent.</p>
          } @else if (transfers().length === 0) {
            <p class="balanced" role="status">✓ Alles ausgeglichen.</p>
          } @else {
            <ol class="transfer-list">
              @for (
                transfer of transfers();
                track transfer.senderParticipantId + transfer.receiverParticipantId;
                let index = $index
              ) {
                <li>
                  <span class="step">{{ index + 1 }}</span
                  ><strong>{{ participantName(transfer.senderParticipantId) }}</strong
                  ><span>zahlt</span><b>{{ formatString(transfer.amountMinor) }}</b
                  ><span>an</span
                  ><strong>{{ participantName(transfer.receiverParticipantId) }}</strong>
                </li>
              }
            </ol>
          }
          @if (current.status === 'active') {
            <a [routerLink]="['/groups', current.id, 'settlements', 'new']" class="primary-button"
              >Erfolgte Zahlung erfassen</a
            >
          }
        </section>
        <section class="section-stack" aria-labelledby="settlements-heading">
          <div class="section-heading">
            <h2 id="settlements-heading">Erfasste Zahlungen</h2>
            <span>{{ settlements().length }}</span>
          </div>
          @if (settlements().length === 0) {
            <div class="card empty-state"><p>Noch keine Zahlung erfasst.</p></div>
          } @else {
            <ul class="ledger-list">
              @for (settlement of settlements(); track settlement.id) {
                <li class="ledger-row">
                  <span class="avatar">↗</span>
                  <span
                    ><strong
                      >{{ participantName(settlement.senderParticipantId) }} →
                      {{ participantName(settlement.receiverParticipantId) }}</strong
                    ><small>{{ settlement.occurredOn }}</small></span
                  >
                  <b>{{ format(settlement.amountMinor) }}</b>
                  @if (current.status === 'active') {
                    <span class="row-actions">
                      <a
                        class="text-button"
                        [routerLink]="['/groups', current.id, 'settlements', settlement.id, 'edit']"
                        >Bearbeiten</a
                      >
                      <button
                        type="button"
                        class="text-button danger-text"
                        (click)="removeSettlement(settlement.id)"
                      >
                        Löschen
                      </button>
                    </span>
                  }
                </li>
              }
            </ul>
          }
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
        </section>
        <section class="card form-stack" aria-labelledby="statement-heading">
          <h2 id="statement-heading">Statement Snapshot</h2>
          <p>Statischer Text des aktuellen lokalen Stands.</p>
          <textarea
            aria-label="Statement Snapshot"
            readonly
            rows="9"
            [value]="statement()"
          ></textarea>
          <button type="button" class="secondary-button" (click)="copyStatement()">
            {{ copied() ? 'Kopiert' : 'Text kopieren' }}
          </button>
        </section>
      }
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalancesPage {
  private readonly store = inject(WorkspaceStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly copied = signal(false);
  protected readonly error = signal('');
  protected readonly groupId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('groupId') ?? '')),
    { initialValue: '' },
  );
  protected readonly group = computed(() => this.store.group(this.groupId()));
  protected readonly participants = computed(() => this.store.participantsForGroup(this.groupId()));
  protected readonly settlements = computed(() => this.store.settlementsForGroup(this.groupId()));
  protected readonly balances = computed(() =>
    calculateBalances(
      this.groupId(),
      this.participants(),
      this.store.expensesForGroup(this.groupId()),
      this.store.settlementsForGroup(this.groupId()),
    ),
  );
  protected readonly strategy = computed(() => this.store.settings().settlementProposalStrategy);
  protected readonly proposal = computed(() => {
    const input = this.balances().map((balance) => ({
      participantId: balance.participantId,
      participantOrder: this.participants().find((item) => item.id === balance.participantId)!
        .order,
      status: this.participants().find((item) => item.id === balance.participantId)!.status,
      balanceAmountMinor: balance.balanceAmountMinor.toString(10),
    }));
    return this.strategy() === 'minimum-transfer'
      ? proposeMinimumTransferSettlements(input)
      : proposeDeterministicSettlements(input);
  });
  protected readonly transfers = computed(() => {
    const proposal = this.proposal();
    return proposal.status === 'success' ? proposal.transfers : [];
  });
  protected readonly statement = computed(() => {
    const group = this.group();
    if (!group) return '';
    const lines = [`JoinSplit – ${group.name}`, `Stand: ${new Date().toISOString()}`, ''];
    for (const balance of this.balances())
      lines.push(
        `${this.participantName(balance.participantId)}: ${formatAmountMinor(balance.balanceAmountMinor, true)}`,
      );
    if (this.store.state().pendingMutations.some((item) => item.groupId === group.id))
      lines.push('', 'Hinweis: Der lokale Stand enthält noch nicht synchronisierte Änderungen.');
    return lines.join('\n');
  });
  protected format = formatAmountMinor;
  protected isPositive(value: bigint): boolean {
    return value > 0n;
  }
  protected isNegative(value: bigint): boolean {
    return value < 0n;
  }
  protected balanceLabel(value: bigint): string {
    return value > 0n ? 'Soll erhalten' : value < 0n ? 'Soll zahlen' : 'Ausgeglichen';
  }
  protected formatString(value: string): string {
    return formatAmountMinor(BigInt(value));
  }
  protected participantName(id: string): string {
    return this.participants().find((item) => item.id === id)?.name ?? '?';
  }
  protected async changeStrategy(event: Event): Promise<void> {
    await this.store.setStrategy((event.target as HTMLSelectElement).value as SettlementStrategy);
  }
  protected async copyStatement(): Promise<void> {
    await navigator.clipboard.writeText(this.statement());
    this.copied.set(true);
  }
  protected async removeSettlement(settlementId: string): Promise<void> {
    if (!window.confirm('Diese Zahlung wirklich löschen?')) return;
    try {
      await this.store.deleteSettlement(settlementId);
      this.error.set('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Löschen fehlgeschlagen.');
    }
  }
}
