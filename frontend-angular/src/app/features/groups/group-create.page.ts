import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { WorkspaceStore } from '../../core/state/workspace.store';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="page-shell narrow">
      <a routerLink="/" class="back-link">← Zurück</a>
      <p class="eyebrow">Neue Gruppe</p>
      <h1>Wofür teilt ihr?</h1>
      <p class="lead">Die Gruppe ist sofort lokal nutzbar. Die feste Währung ist EUR.</p>
      <form class="card form-stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label
          >Gruppenname<input
            formControlName="groupName"
            autocomplete="off"
            [attr.aria-invalid]="invalid('groupName')"
        /></label>
        @if (invalid('groupName')) {
          <p class="error" role="alert">Bitte 1 bis 100 Zeichen eingeben.</p>
        }
        <label class="checkbox"
          ><input type="checkbox" formControlName="addParticipant" /><span
            >Mich als Teilnehmer hinzufügen</span
          ></label
        >
        @if (form.controls.addParticipant.value) {
          <label
            >Mein Name in dieser Gruppe<input
              formControlName="participantName"
              autocomplete="name"
              [attr.aria-invalid]="invalid('participantName')"
          /></label>
          @if (invalid('participantName')) {
            <p class="error" role="alert">Bitte 1 bis 100 Zeichen eingeben.</p>
          }
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button class="primary-button" type="submit" [disabled]="submitting()">
          {{ submitting() ? 'Wird gespeichert …' : 'Gruppe erstellen' }}
        </button>
      </form>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupCreatePage {
  private readonly store = inject(WorkspaceStore);
  private readonly router = inject(Router);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly form = new FormGroup({
    groupName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    addParticipant: new FormControl(this.store.settings().addSelfAsParticipantByDefault, {
      nonNullable: true,
    }),
    participantName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
  });
  protected invalid(name: 'groupName' | 'participantName'): boolean {
    const control = this.form.controls[name];
    return (
      (control.invalid && (control.dirty || this.form.touched)) ||
      (name === 'participantName' &&
        this.form.controls.addParticipant.value &&
        !control.value.trim() &&
        this.form.touched)
    );
  }
  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (
      this.form.invalid ||
      (this.form.controls.addParticipant.value && !this.form.controls.participantName.value.trim())
    )
      return;
    this.submitting.set(true);
    this.error.set('');
    try {
      const groupId = await this.store.createGroup(this.form.getRawValue());
      await this.router.navigate(['/groups', groupId]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Lokales Speichern fehlgeschlagen.');
    } finally {
      this.submitting.set(false);
    }
  }
}
