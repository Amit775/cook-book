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
  /**
   * The cover path that was persisted when the recipe was loaded. Unlike
   * `existingCoverPhotoPath` (which `removeCoverPhoto()` clears), this value
   * is only ever set by the load effect and never changed by user actions.
   * It lets `save()` know what object to delete when the user replaces or
   * removes the cover.
   */
  private readonly savedCoverPhotoPath = signal<string | null>(null);

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
      this.savedCoverPhotoPath.set(recipe.coverPhotoPath);
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

        // The path that was persisted when this recipe was loaded — this is
        // the object that may need deleting if the cover was replaced or removed.
        // We use `savedCoverPhotoPath` (set at load, never touched by user
        // actions) rather than `existingCoverPhotoPath` (which removeCoverPhoto
        // clears to null before save() runs).
        const previousCoverPath = this.savedCoverPhotoPath();

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
          // Firestore write succeeded — delete the orphaned Storage object if
          // the cover was replaced or removed. Never block navigation on failure.
          await this.deleteOrphanedCoverIfSafe(previousCoverPath, coverPhotoPath, editingId);
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

  /**
   * After a successful recipe update, delete the previous cover Storage object
   * if it is no longer referenced by this recipe and no other recipe owned by
   * the current user still references it (same-owner reference guard).
   *
   * Ordering invariant: Firestore write first, Storage delete second.
   * Failures are swallowed so navigation is never blocked.
   */
  private async deleteOrphanedCoverIfSafe(
    previousPath: string | null,
    newPath: string | null,
    recipeId: string,
  ): Promise<void> {
    if (!previousPath || previousPath === newPath) {
      return; // nothing to delete (no previous cover, or cover unchanged)
    }
    try {
      const userId = this.session.user()?.uid;
      if (!userId) {
        return;
      }
      const isStillReferenced = await this.isCoverReferencedByOtherOwnedRecipe(previousPath, recipeId, userId);
      if (isStillReferenced) {
        return; // another owned recipe still uses this object — skip delete
      }
      await this.storageService.deleteCoverPhoto(previousPath);
    } catch (error) {
      console.error('[RecipeEditorPage] Failed to delete orphaned cover photo:', error);
      // Never block navigation — a rare orphan is acceptable
    }
  }

  /**
   * Check whether any other recipe owned by `userId` (excluding `excludeRecipeId`)
   * still references `coverPhotoPath`. Uses in-memory filtering over `listMyRecipes`
   * so no composite Firestore index is needed.
   */
  private async isCoverReferencedByOtherOwnedRecipe(
    coverPhotoPath: string,
    excludeRecipeId: string,
    userId: string,
  ): Promise<boolean> {
    const ownedRecipes = await this.recipeService.listMyRecipes(userId);
    return ownedRecipes.some(
      (recipe) => recipe.recipeId !== excludeRecipeId && recipe.coverPhotoPath === coverPhotoPath,
    );
  }
}
