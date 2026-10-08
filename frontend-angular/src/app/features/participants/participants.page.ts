import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { GroupNavComponent } from '../../shared/group-nav.component';

@Component({
  imports: [ReactiveFormsModule, RouterLink, GroupNavComponent],
  template: `
    <main class="page-shell narrow">
      @if (group(); as current) {
        <p class="eyebrow">{{ current.name }}</p>
        <h1>Teilnehmer</h1>
        <app-group-nav [groupId]="current.id" />
        <ul class="ledger-list">
          @for (participant of participants(); track participant.id; let index = $index) {
            <li class="ledger-row">
              <span class="avatar">{{ participant.name.slice(0, 1).toUpperCase() }}</span
              ><span
                ><strong>{{ participant.name }}</strong
                ><small
                  >Reihenfolge {{ participant.order + 1 }} ·
                  {{ participant.status === 'active' ? 'Aktiv' : 'Inaktiv' }}</small
                ></span
              >
              <span class="row-actions">
                <button
                  type="button"
                  class="text-button"
                  [disabled]="current.status === 'archived'"
                  (click)="rename(participant.id, participant.name)"
                >
                  Umbenennen
                </button>
                <button
                  type="button"
                  class="text-button"
                  [disabled]="current.status === 'archived'"
                  (click)="toggleStatus(participant.id, participant.status === 'inactive')"
                >
                  {{ participant.status === 'active' ? 'Deaktivieren' : 'Reaktivieren' }}
                </button>
                <button
                  type="button"
                  class="text-button danger-text"
                  [disabled]="current.status === 'archived'"
                  (click)="remove(participant.id)"
                >
                  Löschen
                </button>
              </span>
            </li>
          }
        </ul>
        @if (current.status === 'active') {
          <form class="card form-stack" (submit)="add($event)">
            <h2>Teilnehmer hinzufügen</h2>
            <label>Name<input [formControl]="name" autocomplete="off" maxlength="100" /></label>
            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }
            <button class="primary-button" type="submit">Hinzufügen</button>
          </form>
        } @else {
          <p class="notice" role="status">Die Gruppe ist archiviert und daher schreibgeschützt.</p>
        }
      } @else {
        <a routerLink="/">Gruppe nicht gefunden – zurück</a>
      }
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParticipantsPage {
  private readonly store = inject(WorkspaceStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly groupId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('groupId') ?? '')),
    { initialValue: '' },
  );
  protected readonly group = computed(() => this.store.group(this.groupId()));
  protected readonly participants = computed(() => this.store.participantsForGroup(this.groupId()));
  protected readonly name = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(100)],
  });
  protected readonly error = signal('');
  protected async add(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.name.markAsTouched();
    if (this.name.invalid) {
      this.error.set('Bitte 1 bis 100 Zeichen eingeben.');
      return;
    }
    try {
      await this.store.addParticipant(this.groupId(), this.name.value);
      this.name.reset();
      this.error.set('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    }
  }
  protected async rename(participantId: string, currentName: string): Promise<void> {
    const name = window.prompt('Neuer Teilnehmername', currentName);
    if (name === null || name === currentName) return;
    await this.run(() => this.store.renameParticipant(participantId, name));
  }
  protected async toggleStatus(participantId: string, active: boolean): Promise<void> {
    await this.run(() => this.store.setParticipantActive(participantId, active));
  }
  protected async remove(participantId: string): Promise<void> {
    if (!window.confirm('Teilnehmer ohne Finanzbezug wirklich löschen?')) return;
    await this.run(() => this.store.deleteParticipant(participantId));
  }
  private async run(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
      this.error.set('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Änderung fehlgeschlagen.');
    }
  }
}
