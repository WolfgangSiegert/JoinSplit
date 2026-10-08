import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeaderComponent } from './shared/app-header.component';
import { WorkspaceStore } from './core/state/workspace.store';

@Component({
  imports: [RouterOutlet, AppHeaderComponent],
  selector: 'app-root',
  template: `
    <app-header />
    @if (store.loadError()) {
      <main class="page-shell">
        <section class="card error-card" role="alert">
          <h1>Lokale Daten konnten nicht geladen werden</h1>
          <p>{{ store.loadError() }}</p>
        </section>
      </main>
    } @else {
      <router-outlet />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly store = inject(WorkspaceStore);
}
