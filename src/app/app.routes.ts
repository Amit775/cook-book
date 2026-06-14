import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/browse/browse-page').then((m) => m.BrowsePage),
  },
  {
    path: 'create',
    loadComponent: () => import('./features/recipes/recipe-editor-page').then((m) => m.RecipeEditorPage),
  },
  {
    path: 'recipes/:recipeId',
    loadComponent: () => import('./features/recipes/recipe-detail-page').then((m) => m.RecipeDetailPage),
  },
  {
    path: 'library',
    loadComponent: () => import('./features/library/library-page').then((m) => m.LibraryPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  { path: '**', redirectTo: '' },
];
