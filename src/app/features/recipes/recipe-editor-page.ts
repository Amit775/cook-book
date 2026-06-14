import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { applyEach, form, FormField, minLength, required, submit } from '@angular/forms/signals';

import { minutesToDuration } from '../../core/models/duration.model';
import { Ingredient } from '../../core/models/ingredient.model';
import { RECIPE_TYPES, RecipeType } from '../../core/models/recipe-type.model';
import { RECIPE_VISIBILITIES, RecipeVisibility } from '../../core/models/recipe-visibility.model';
import { RecipeService } from '../../core/services/recipe.service';
import { SessionStore } from '../../core/state/session.store';

interface RecipeEditorModel {
  title: string;
  description: string;
  type: RecipeType;
  visibility: RecipeVisibility;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  tagsText: string;
}

function emptyModel(): RecipeEditorModel {
  return {
    title: '',
    description: '',
    type: 'meal',
    visibility: 'private',
    servings: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    ingredients: [{ quantity: null, unit: '', name: '' }],
    steps: [''],
    tagsText: '',
  };
}

@Component({
  selector: 'app-recipe-editor-page',
  imports: [TranslocoDirective, FormField, RouterLink],
  templateUrl: './recipe-editor-page.html',
})
export class RecipeEditorPage {
  private readonly recipeService = inject(RecipeService);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly recipeTypes = RECIPE_TYPES;
  protected readonly visibilities = RECIPE_VISIBILITIES;
  protected readonly isSignedIn = this.session.isAuthenticated;
  protected readonly isSaving = signal(false);

  protected readonly model = signal<RecipeEditorModel>(emptyModel());
  protected readonly recipeForm = form(this.model, (path) => {
    required(path.title);
    minLength(path.title, 2);
    applyEach(path.ingredients, (ingredient) => {
      required(ingredient.name);
    });
    applyEach(path.steps, (step) => {
      required(step);
    });
  });

  addIngredient(): void {
    this.model.update((current) => ({
      ...current,
      ingredients: [...current.ingredients, { quantity: null, unit: '', name: '' }],
    }));
  }

  removeIngredient(index: number): void {
    this.model.update((current) => ({
      ...current,
      ingredients: current.ingredients.filter((_, position) => position !== index),
    }));
  }

  addStep(): void {
    this.model.update((current) => ({ ...current, steps: [...current.steps, ''] }));
  }

  removeStep(index: number): void {
    this.model.update((current) => ({
      ...current,
      steps: current.steps.filter((_, position) => position !== index),
    }));
  }

  save(event: Event): void {
    event.preventDefault();
    const author = this.session.user();
    if (!author) {
      return;
    }
    submit(this.recipeForm, async () => {
      this.isSaving.set(true);
      try {
        const value = this.model();
        const recipeId = await this.recipeService.createRecipe(
          {
            title: value.title.trim(),
            description: value.description.trim(),
            type: value.type,
            visibility: value.visibility,
            sharedWith: [],
            parentId: null,
            ingredients: value.ingredients.filter((ingredient) => ingredient.name.trim().length > 0),
            steps: value.steps.map((step) => step.trim()).filter((step) => step.length > 0),
            tags: value.tagsText
              .split(',')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0),
            keywords: [],
            servings: value.servings,
            prepTime: minutesToDuration(value.prepTimeMinutes),
            cookTime: minutesToDuration(value.cookTimeMinutes),
            coverPhotoPath: null,
          },
          author,
        );
        await this.router.navigateByUrl(`/recipes/${recipeId}`);
      } finally {
        this.isSaving.set(false);
      }
    });
  }
}
