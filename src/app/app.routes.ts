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
    path: 'recipes/:recipeId/edit',
    loadComponent: () => import('./features/recipes/recipe-editor-page').then((m) => m.RecipeEditorPage),
  },
  {
    path: 'recipes/:recipeId/cook',
    loadComponent: () => import('./features/recipes/cooking-mode-page').then((m) => m.CookingModePage),
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
    path: 'shopping-list',
    loadComponent: () => import('./features/shopping-list/shopping-list-page').then((m) => m.ShoppingListPage),
  },
  {
    path: 'meal-planner',
    loadComponent: () => import('./features/meal-planner/meal-planner-page').then((m) => m.MealPlannerPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'share/:shareId',
    loadComponent: () => import('./features/recipes/join-share-page').then((m) => m.JoinSharePage),
  },
  { path: '**', redirectTo: '' },
];
