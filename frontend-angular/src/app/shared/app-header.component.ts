import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SyncService } from '../core/api/sync.service';
import { WorkspaceStore } from '../core/state/workspace.store';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="app-header">
      <a routerLink="/" class="wordmark" aria-label="JoinSplit Startseite">
        <img src="favicon.svg" width="32" height="32" alt="" /><span>JoinSplit</span
        ><small>Angular</small>
      </a>
      <nav aria-label="Hauptnavigation">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"
          >Gruppen</a
        >
        <a routerLink="/groups/new" routerLinkActive="active">Neue Gruppe</a>
      </nav>
      <button
        type="button"
        class="sync-button"
        (click)="sync.synchronize()"
        [disabled]="sync.running() || store.pendingCount() === 0"
      >
        {{ sync.running() ? 'Synchronisiert …' : store.pendingCount() + ' ausstehend' }}
      </button>
    </header>
    @if (sync.message()) {
      <p class="sync-message" role="status">{{ sync.message() }}</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeaderComponent {
  protected readonly store = inject(WorkspaceStore);
  protected readonly sync = inject(SyncService);
}
