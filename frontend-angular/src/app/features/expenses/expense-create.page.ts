import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
  calculateEqualShares,
  formatAmountMinor,
  localToday,
  parseAmountMinor,
} from '../../core/domain/ledger';
import { WorkspaceStore } from '../../core/state/workspace.store';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="page-shell narrow">
      <a [routerLink]="['/groups', groupId()]" class="back-link">← Zur Gruppe</a>
      <p class="eyebrow">{{ group()?.name }}</p>
      <h1>{{ existing() ? 'Ausgabe bearbeiten' : 'Ausgabe erfassen' }}</h1>
      <form class="card form-stack" [formGroup]="form" (ngSubmit)="submit()">
        <label>Beschreibung<input formControlName="description" maxlength="200" /></label>
        <label
          >Betrag in Euro<input formControlName="amount" inputmode="decimal" placeholder="0,00"
        /></label>
        <label>Datum<input formControlName="incurredOn" type="date" /></label>
        <label
          >Bezahlt von<select formControlName="payerParticipantId">
            <option value="">Bitte wählen</option>
            @for (participant of participants(); track participant.id) {
              <option [value]="participant.id">{{ participant.name }}</option>
            }
          </select></label
        >
        <fieldset>
          <legend>Aufteilen auf</legend>
          @for (participant of participants(); track participant.id) {
            <label class="checkbox"
              ><input
                type="checkbox"
                [checked]="selected(participant.id)"
                (change)="toggle(participant.id)"
              /><span>{{ participant.name }}</span></label
            >
          }
        </fieldset>
        @if (preview().length) {
          <div class="split-preview">
            <strong>Equal-Split-Vorschau</strong>
            @for (share of preview(); track share.participantId) {
              <span
                >{{ participantName(share.participantId) }}
                <b>{{ format(share.amountMinor) }}</b></span
              >
            }
          </div>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button class="primary-button" type="submit">Ausgabe speichern</button>
        @if (existing()) {
          <button class="danger-button" type="button" (click)="remove()">Ausgabe löschen</button>
        }
      </form>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseCreatePage {
  private readonly store = inject(WorkspaceStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly groupId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('groupId') ?? '')),
    { initialValue: '' },
  );
  protected readonly expenseId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('expenseId') ?? '')),
    { initialValue: '' },
  );
  protected readonly group = computed(() => this.store.group(this.groupId()));
  protected readonly existing = computed(() => this.store.expense(this.expenseId()));
  protected readonly participants = computed(() =>
    this.store
      .participantsForGroup(this.groupId())
      .filter(
        (item) =>
          item.status === 'active' ||
          item.id === this.existing()?.payerParticipantId ||
          this.existing()?.shares.some((share) => share.participantId === item.id),
      ),
  );
  protected readonly form = new FormGroup({
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    amount: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    incurredOn: new FormControl(localToday(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    payerParticipantId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    participantIds: new FormControl<string[]>([], {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly error = signal('');
  protected format = formatAmountMinor;
  protected readonly preview = computed(() => {
    const value = this.formValue();
    const amount = parseAmountMinor(value.amount ?? '');
    const ids = value.participantIds ?? [];
    try {
      return amount && ids.length ? calculateEqualShares(amount, ids, this.participants()) : [];
    } catch {
      return [];
    }
  });
  constructor() {
    const existing = this.store.expense(this.route.snapshot.paramMap.get('expenseId') ?? '');
    const ids =
      existing?.shares.map((share) => share.participantId) ??
      this.participants().map((item) => item.id);
    this.form.setValue({
      description: existing?.description ?? '',
      amount: existing
        ? `${Math.floor(existing.amountMinor / 100)},${String(existing.amountMinor % 100).padStart(2, '0')}`
        : '',
      incurredOn: existing?.incurredOn ?? localToday(),
      payerParticipantId: existing?.payerParticipantId ?? ids[0] ?? '',
      participantIds: ids,
    });
  }
  protected selected(id: string): boolean {
    return this.form.controls.participantIds.value.includes(id);
  }
  protected toggle(id: string): void {
    const current = this.form.controls.participantIds.value;
    this.form.controls.participantIds.setValue(
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }
  protected participantName(id: string): string {
    return this.participants().find((item) => item.id === id)?.name ?? '?';
  }
  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Bitte fülle alle Felder aus und wähle mindestens einen Teilnehmer.');
      return;
    }
    try {
      await this.store.saveExpense(
        this.groupId(),
        this.form.getRawValue(),
        this.expenseId() || undefined,
      );
      await this.router.navigate(['/groups', this.groupId()]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    }
  }
  protected async remove(): Promise<void> {
    const existing = this.existing();
    if (!existing || !window.confirm('Diese Ausgabe wirklich löschen?')) return;
    try {
      await this.store.deleteExpense(existing.id);
      await this.router.navigate(['/groups', this.groupId()]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Löschen fehlgeschlagen.');
    }
  }
}
