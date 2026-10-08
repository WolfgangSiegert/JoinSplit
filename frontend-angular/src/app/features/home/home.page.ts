import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkspaceStore } from '../../core/state/workspace.store';

@Component({
  imports: [RouterLink],
  template: `
    <main class="page-shell">
      <section class="hero">
        <p class="eyebrow">Gemeinsam zahlen. Klar ausgleichen.</p>
        <h1>Ausgaben teilen, ohne den Überblick zu verlieren.</h1>
        <p>
          Die Angular-Portierung bildet den lokalen JoinSplit-Kern ab: Gruppen, Teilnehmer,
          Ausgaben, Salden und Zahlungen.
        </p>
        <a routerLink="/groups/new" class="primary-button">Neue Gruppe starten</a>
      </section>
      <section aria-labelledby="groups-heading" class="section-stack">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Dein Bereich</p>
            <h2 id="groups-heading">Gruppen</h2>
          </div>
          <span>{{ store.activeGroups().length }} aktiv</span>
        </div>
        @if (store.activeGroups().length === 0) {
          <div class="card empty-state">
            <h3>Noch keine Gruppe</h3>
            <p>Du kannst offline beginnen. Der Stand wird dauerhaft in IndexedDB gespeichert.</p>
          </div>
        } @else {
          <ul class="ledger-list">
            @for (group of store.activeGroups(); track group.id; let index = $index) {
              <li>
                <a [routerLink]="['/groups', group.id]" class="ledger-row">
                  <span class="avatar">{{ group.name.slice(0, 1).toUpperCase() }}</span>
                  <span
                    ><strong>{{ group.name }}</strong
                    ><small>Aktiv · EUR · {{ group.participantIds.length }} Teilnehmer</small></span
                  >
                  <span aria-hidden="true">›</span>
                </a>
              </li>
            }
          </ul>
        }
      </section>
      @if (store.archivedGroups().length) {
        <section aria-labelledby="archived-groups-heading" class="section-stack">
          <div class="section-heading">
            <h2 id="archived-groups-heading">Archivierte Gruppen</h2>
            <span>{{ store.archivedGroups().length }}</span>
          </div>
          <ul class="ledger-list">
            @for (group of store.archivedGroups(); track group.id) {
              <li>
                <a [routerLink]="['/groups', group.id]" class="ledger-row">
                  <span class="avatar">{{ group.name.slice(0, 1).toUpperCase() }}</span>
                  <span
                    ><strong>{{ group.name }}</strong
                    ><small>Archiviert · schreibgeschützt</small></span
                  >
                  <span aria-hidden="true">›</span>
                </a>
              </li>
            }
          </ul>
        </section>
      }
      <aside class="learning-note">
        <strong>Lerntrack, keine zweite Produktions-App.</strong>
        <span
          >Die Portierung ist absichtlich getrennt. Nuxt bleibt unverändert und Laravel bleibt die
          kanonische API.</span
        >
      </aside>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly store = inject(WorkspaceStore);
}
