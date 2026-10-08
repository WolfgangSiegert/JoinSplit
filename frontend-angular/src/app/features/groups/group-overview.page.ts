import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { formatAmountMinor } from '../../core/domain/ledger';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { GroupNavComponent } from '../../shared/group-nav.component';

@Component({
  imports: [RouterLink, GroupNavComponent],
  template: `
    <main class="page-shell">
      @if (group(); as current) {
        <p class="eyebrow">Gruppe</p>
        <h1>{{ current.name }}</h1>
        @if (current.status === 'archived') {
          <p class="notice" role="status">Diese Gruppe ist archiviert und schreibgeschützt.</p>
        }
        <app-group-nav [groupId]="current.id" />
        @if (current.status === 'active') {
          <section class="action-grid" aria-label="Schnellaktionen">
            <a [routerLink]="['/groups', current.id, 'expenses', 'new']" class="primary-button"
              >Ausgabe erfassen</a
            >
            <a [routerLink]="['/groups', current.id, 'participants']" class="secondary-button"
              >Teilnehmer verwalten</a
            >
            <a [routerLink]="['/groups', current.id, 'balances']" class="secondary-button"
              >Salden & Ausgleich</a
            >
          </section>
        }
        <section class="section-stack" aria-labelledby="expenses-heading">
          <div class="section-heading">
            <h2 id="expenses-heading">Ausgaben</h2>
            <span>{{ expenses().length }}</span>
          </div>
          @if (expenses().length === 0) {
            <div class="card empty-state"><p>Noch keine Ausgabe erfasst.</p></div>
          } @else {
            <ul class="ledger-list">
              @for (expense of expenses(); track expense.id) {
                <li class="ledger-row">
                  <span class="avatar">€</span
                  ><span
                    ><strong>{{ expense.description }}</strong
                    ><small
                      >{{ expense.incurredOn }} ·
                      {{ payerName(expense.payerParticipantId) }} zahlte</small
                    ></span
                  ><b>{{ format(expense.amountMinor) }}</b>
                  @if (current.status === 'active') {
                    <span class="row-actions">
                      <a
                        class="text-button"
                        [routerLink]="['/groups', current.id, 'expenses', expense.id, 'edit']"
                        >Bearbeiten</a
                      >
                      <button
                        type="button"
                        class="text-button danger-text"
                        (click)="removeExpense(expense.id)"
                      >
                        Löschen
                      </button>
                    </span>
                  }
                </li>
              }
            </ul>
          }
        </section>
        <section class="card form-stack" aria-labelledby="lifecycle-heading">
          <h2 id="lifecycle-heading">Gruppenstatus</h2>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          @if (current.status === 'archived') {
            <button type="button" class="secondary-button" (click)="reactivate()">
              Gruppe reaktivieren
            </button>
          } @else if (current.hasFinancialHistory) {
            <button type="button" class="danger-button" (click)="archive()">
              Gruppe archivieren
            </button>
          } @else {
            <p>
              Eine Gruppe ohne Finanzhistorie kann nach erfolgreicher Synchronisierung gelöscht
              werden.
            </p>
            <button type="button" class="danger-button" (click)="removeGroup()">
              Gruppe löschen
            </button>
          }
        </section>
      } @else {
        <section class="card error-card">
          <h1>Gruppe nicht gefunden</h1>
          <a routerLink="/">Zur Gruppenliste</a>
        </section>
      }
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupOverviewPage {
  private readonly store = inject(WorkspaceStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly error = signal('');
  protected readonly groupId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('groupId') ?? '')),
    { initialValue: '' },
  );
  protected readonly group = computed(() => this.store.group(this.groupId()));
  protected readonly expenses = computed(() => this.store.expensesForGroup(this.groupId()));
  protected format = formatAmountMinor;
  protected payerName(id: string): string {
    return (
      this.store.participantsForGroup(this.groupId()).find((item) => item.id === id)?.name ??
      'Unbekannt'
    );
  }
  protected async removeExpense(expenseId: string): Promise<void> {
    if (!window.confirm('Diese Ausgabe wirklich löschen?')) return;
    await this.run(() => this.store.deleteExpense(expenseId));
  }
  protected async archive(): Promise<void> {
    if (!window.confirm('Die Gruppe archivieren? Sie wird danach schreibgeschützt.')) return;
    await this.run(() => this.store.setGroupArchived(this.groupId(), true));
  }
  protected async reactivate(): Promise<void> {
    await this.run(() => this.store.setGroupArchived(this.groupId(), false));
  }
  protected async removeGroup(): Promise<void> {
    if (!window.confirm('Diese Gruppe endgültig löschen?')) return;
    const ok = await this.run(() => this.store.deleteGroup(this.groupId()));
    if (ok) await this.router.navigate(['/']);
  }
  private async run(operation: () => Promise<void>): Promise<boolean> {
    try {
      await operation();
      this.error.set('');
      return true;
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Änderung fehlgeschlagen.');
      return false;
    }
  }
}
