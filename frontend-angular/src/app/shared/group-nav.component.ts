import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-group-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="group-nav" aria-label="Gruppenbereiche">
      <a
        [routerLink]="['/groups', groupId()]"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        >Übersicht</a
      >
      <a [routerLink]="['/groups', groupId(), 'participants']" routerLinkActive="active"
        >Teilnehmer</a
      >
      <a [routerLink]="['/groups', groupId(), 'balances']" routerLinkActive="active">Salden</a>
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupNavComponent {
  readonly groupId = input.required<string>();
}
