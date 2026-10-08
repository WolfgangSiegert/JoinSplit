import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage) },
  {
    path: 'groups/new',
    loadComponent: () =>
      import('./features/groups/group-create.page').then((m) => m.GroupCreatePage),
  },
  {
    path: 'groups/:groupId',
    loadComponent: () =>
      import('./features/groups/group-overview.page').then((m) => m.GroupOverviewPage),
  },
  {
    path: 'groups/:groupId/participants',
    loadComponent: () =>
      import('./features/participants/participants.page').then((m) => m.ParticipantsPage),
  },
  {
    path: 'groups/:groupId/expenses/new',
    loadComponent: () =>
      import('./features/expenses/expense-create.page').then((m) => m.ExpenseCreatePage),
  },
  {
    path: 'groups/:groupId/expenses/:expenseId/edit',
    loadComponent: () =>
      import('./features/expenses/expense-create.page').then((m) => m.ExpenseCreatePage),
  },
  {
    path: 'groups/:groupId/balances',
    loadComponent: () => import('./features/balances/balances.page').then((m) => m.BalancesPage),
  },
  {
    path: 'groups/:groupId/settlements/new',
    loadComponent: () =>
      import('./features/settlements/settlement-create.page').then((m) => m.SettlementCreatePage),
  },
  {
    path: 'groups/:groupId/settlements/:settlementId/edit',
    loadComponent: () =>
      import('./features/settlements/settlement-create.page').then((m) => m.SettlementCreatePage),
  },
  { path: '**', redirectTo: '' },
];
