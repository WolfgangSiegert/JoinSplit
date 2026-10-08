import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { localToday } from '../../core/domain/ledger';
import { SettlementConfirmationError, WorkspaceStore } from '../../core/state/workspace.store';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="page-shell narrow">
      <a [routerLink]="['/groups', groupId(), 'balances']" class="back-link">← Zu Salden</a>
      <p class="eyebrow">{{ group()?.name }}</p>
      <h1>{{ existing() ? 'Zahlung bearbeiten' : 'Zahlung dokumentieren' }}</h1>
      <p class="lead">
        Nur tatsächlich erfolgte Zahlungen erfassen; der Vorschlag allein ist noch kein Settlement.
      </p>
      <form class="card form-stack" [formGroup]="form" (ngSubmit)="submit()">
        <label
          >Gezahlt von<select formControlName="senderParticipantId">
            <option value="">Bitte wählen</option>
            @for (participant of participants(); track participant.id) {
              <option [value]="participant.id">{{ participant.name }}</option>
            }
          </select></label
        >
        <label
          >Gezahlt an<select formControlName="receiverParticipantId">
            <option value="">Bitte wählen</option>
            @for (participant of participants(); track participant.id) {
              <option [value]="participant.id">{{ participant.name }}</option>
            }
          </select></label
        >
        <label
          >Betrag in Euro<input formControlName="amount" inputmode="decimal" placeholder="0,00"
        /></label>
        <label>Datum<input formControlName="occurredOn" type="date" /></label>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button class="primary-button" type="submit">Zahlung speichern</button>
        @if (existing()) {
          <button class="danger-button" type="button" (click)="remove()">Zahlung löschen</button>
        }
      </form>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettlementCreatePage {
  private readonly store = inject(WorkspaceStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly groupId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('groupId') ?? '')),
    { initialValue: '' },
  );
  protected readonly settlementId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('settlementId') ?? '')),
    { initialValue: '' },
  );
  protected readonly group = computed(() => this.store.group(this.groupId()));
  protected readonly existing = computed(() => this.store.settlement(this.settlementId()));
  protected readonly participants = computed(() => this.store.participantsForGroup(this.groupId()));
  protected readonly form = new FormGroup({
    senderParticipantId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    receiverParticipantId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    amount: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    occurredOn: new FormControl(localToday(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  protected readonly error = signal('');
  constructor() {
    const existing = this.store.settlement(this.route.snapshot.paramMap.get('settlementId') ?? '');
    if (existing) {
      this.form.setValue({
        senderParticipantId: existing.senderParticipantId,
        receiverParticipantId: existing.receiverParticipantId,
        amount: `${existing.amountMinor / 100n},${String(existing.amountMinor % 100n).padStart(2, '0')}`,
        occurredOn: existing.occurredOn,
      });
    }
  }
  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Bitte fülle alle Felder aus.');
      return;
    }
    try {
      await this.save(false);
      await this.router.navigate(['/groups', this.groupId(), 'balances']);
    } catch (error) {
      if (error instanceof SettlementConfirmationError) {
        const accepted = window.confirm(
          'Die Zahlung folgt nicht dem aktuellen offenen Saldo oder übersteigt ihn. Trotzdem speichern?',
        );
        if (accepted) {
          await this.save(true);
          await this.router.navigate(['/groups', this.groupId(), 'balances']);
        }
        return;
      }
      this.error.set(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    }
  }
  private save(confirmationAccepted: boolean): Promise<string> {
    return this.store.saveSettlement(
      this.groupId(),
      this.form.getRawValue(),
      this.settlementId() || undefined,
      confirmationAccepted,
    );
  }
  protected async remove(): Promise<void> {
    const existing = this.existing();
    if (!existing || !window.confirm('Diese Zahlung wirklich löschen?')) return;
    try {
      await this.store.deleteSettlement(existing.id);
      await this.router.navigate(['/groups', this.groupId(), 'balances']);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Löschen fehlgeschlagen.');
    }
  }
}
