import { Component, computed, effect, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { applyEach, form, FormField, minLength, required, submit } from '@angular/forms/signals';

import { minutesToDuration, parseDurationToMinutes } from '../../core/models/duration.model';
import { Ingredient } from '../../core/models/ingredient.model';
import { Recipe, RecipeDraft } from '../../core/models/recipe.model';
import { RECIPE_TYPES, RecipeType } from '../../core/models/recipe-type.model';
import { RECIPE_UNITS } from '../../core/models/recipe-unit.model';
import { RECIPE_VISIBILITIES, RecipeVisibility } from '../../core/models/recipe-visibility.model';
import { IngredientService } from '../../core/services/ingredient.service';
import { RecipeService } from '../../core/services/recipe.service';
import { StorageService } from '../../core/services/storage.service';
import { SessionStore } from '../../core/state/session.store';
import { IngredientCombobox, IngredientSelection } from '../../shared/ingredient-combobox/ingredient-combobox';

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
    ingredients: [{ ingredientId: null, quantity: null, unit: '', name: '' }],
    steps: [''],
    tagsText: '',
  };
}

function modelFromRecipe(recipe: Recipe): RecipeEditorModel {
  return {
    title: recipe.title,
    description: recipe.description,
    type: recipe.type,
    visibility: recipe.visibility,
    servings: recipe.servings,
    prepTimeMinutes: parseDurationToMinutes(recipe.prepTime),
    cookTimeMinutes: parseDurationToMinutes(recipe.cookTime),
    ingredients:
      recipe.ingredients.length > 0
        ? recipe.ingredients.map((ingredient) => ({ ...ingredient }))
        : [{ ingredientId: null, quantity: null, unit: '', name: '' }],
    steps: recipe.steps.length > 0 ? [...recipe.steps] : [''],
    tagsText: recipe.tags.join(', '),
  };
}

@Component({
  selector: 'app-recipe-editor-page',
  imports: [TranslocoDirective, FormField, RouterLink, IngredientCombobox],
  templateUrl: './recipe-editor-page.html',
})
export class RecipeEditorPage {
  private readonly recipeService = inject(RecipeService);
  private readonly ingredientService = inject(IngredientService);
  private readonly storageService = inject(StorageService);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  /** Bound from the `:recipeId` route param on the edit route; empty on `/create`. */
  readonly recipeId = input<string>('');
  protected readonly isEditMode = computed(() => !!this.recipeId());

  protected readonly recipeTypes = RECIPE_TYPES;
  protected readonly visibilities = RECIPE_VISIBILITIES;
  protected readonly units = RECIPE_UNITS;
  protected readonly isSignedIn = this.session.isAuthenticated;
  protected readonly isSaving = signal(false);
  protected readonly coverPhotoFile = signal<File | null>(null);
  protected readonly coverPhotoPreview = signal<string | null>(null);
  private readonly existingCoverPhotoPath = signal<string | null>(null);

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

  /** Loads the recipe being edited; no-op on `/create` (params returns undefined). */
  protected readonly existingRecipe = resource({
    params: () => this.recipeId() || undefined,
    loader: ({ params }) => this.recipeService.getRecipe(params),
  });

  private populatedId: string | null = null;

  constructor() {
    // When editing, populate the form once the recipe (and the signed-in user) load.
    effect(() => {
      const recipe = this.existingRecipe.value();
      const user = this.session.user();
      if (!recipe || !user || this.populatedId === recipe.recipeId) {
        return;
      }
      this.populatedId = recipe.recipeId;
      // Only the owner may edit; others are sent to the read-only detail page.
      if (recipe.authorId !== user.uid) {
        void this.router.navigateByUrl(`/recipes/${recipe.recipeId}`);
        return;
      }
      this.model.set(modelFromRecipe(recipe));
      this.existingCoverPhotoPath.set(recipe.coverPhotoPath);
      if (recipe.coverPhotoPath) {
        void this.storageService
          .getPhotoUrl(recipe.coverPhotoPath)
          .then((url) => this.coverPhotoPreview.set(url));
      }
    });
  }

  addIngredient(): void {
    this.model.update((current) => ({
      ...current,
      ingredients: [...current.ingredients, { ingredientId: null, quantity: null, unit: '', name: '' }],
    }));
  }

  removeIngredient(index: number): void {
    this.model.update((current) => ({
      ...current,
      ingredients: current.ingredients.filter((_, position) => position !== index),
    }));
  }

  /** Current name for the ingredient at `index`, feeding the combobox's controlled input. */
  ingredientName(index: number): string {
    return this.model().ingredients[index]?.name ?? '';
  }

  /** Apply a combobox selection (typed or picked) onto the ingredient at `index`. */
  onIngredientSelected(index: number, selection: IngredientSelection): void {
    this.model.update((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient, position) =>
        position === index
          ? { ...ingredient, name: selection.name, ingredientId: selection.ingredientId }
          : ingredient,
      ),
    }));
  }

  /**
   * Drop blank rows and link every remaining ingredient to a catalog entry:
   * picked ones already carry an `ingredientId`; free-typed ones are looked up
   * (or created) by name so duplicates written differently converge.
   */
  private async resolveIngredients(ingredients: Ingredient[], userId: string): Promise<Ingredient[]> {
    const named = ingredients.filter((ingredient) => ingredient.name.trim().length > 0);
    return Promise.all(
      named.map(async (ingredient) => {
        const name = ingredient.name.trim();
        if (ingredient.ingredientId) {
          return { ...ingredient, name };
        }
        const catalogIngredient = await this.ingredientService.findOrCreate(name, userId);
        return { ...ingredient, name: catalogIngredient.name, ingredientId: catalogIngredient.ingredientId };
      }),
    );
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

  onCoverPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const previousPreview = this.coverPhotoPreview();
    if (previousPreview) {
      URL.revokeObjectURL(previousPreview);
    }
    this.coverPhotoFile.set(file);
    this.coverPhotoPreview.set(file ? URL.createObjectURL(file) : null);
  }

  removeCoverPhoto(): void {
    const previousPreview = this.coverPhotoPreview();
    if (previousPreview) {
      URL.revokeObjectURL(previousPreview);
    }
    this.coverPhotoFile.set(null);
    this.coverPhotoPreview.set(null);
    this.existingCoverPhotoPath.set(null);
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
        const file = this.coverPhotoFile();
        const coverPhotoPath = file
          ? await this.storageService.uploadCoverPhoto(file, author.uid)
          : this.existingCoverPhotoPath();
        const ingredients = await this.resolveIngredients(value.ingredients, author.uid);
        const draft: RecipeDraft = {
          title: value.title.trim(),
          description: value.description.trim(),
          type: value.type,
          visibility: value.visibility,
          sharedWith: this.existingRecipe.value()?.sharedWith ?? [],
          parentId: null,
          ingredients,
          steps: value.steps.map((step) => step.trim()).filter((step) => step.length > 0),
          tags: value.tagsText
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
          keywords: [],
          servings: value.servings,
          prepTime: minutesToDuration(value.prepTimeMinutes),
          cookTime: minutesToDuration(value.cookTimeMinutes),
          coverPhotoPath,
        };
        const editingId = this.recipeId();
        if (editingId) {
          await this.recipeService.updateRecipe(editingId, draft);
          await this.router.navigateByUrl(`/recipes/${editingId}`);
        } else {
          const newRecipeId = await this.recipeService.createRecipe(draft, author);
          await this.router.navigateByUrl(`/recipes/${newRecipeId}`);
        }
      } finally {
        this.isSaving.set(false);
      }
    });
  }
}
