import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { Recipe } from '../../core/models/recipe.model';
import { UserProfile } from '../../core/models/user-profile.model';
import { RecipeService } from '../../core/services/recipe.service';
import { UserProfileService } from '../../core/services/user-profile.service';

@Component({
  selector: 'app-recipe-share',
  imports: [TranslocoDirective],
  template: `
    <section class="recipe-share" *transloco="let t">
      <h2>{{ t('share.title') }}</h2>

      <form class="share-form" (submit)="share($event)">
        <label class="field">
          <span class="field-label">{{ t('share.emailLabel') }}</span>
          <input
            #emailField
            type="email"
            dir="ltr"
            autocomplete="off"
            [value]="email()"
            (input)="email.set(emailField.value)"
            [placeholder]="t('share.emailPlaceholder')"
          />
        </label>
        <button type="submit" class="button button--primary" [disabled]="!canShare() || isWorking()">
          {{ isWorking() ? t('share.sharing') : t('share.add') }}
        </button>
      </form>

      @if (errorKey(); as key) {
        <p class="error" role="alert">{{ t(key) }}</p>
      }

      <h3 class="share-subtitle">{{ t('share.sharedWith') }}</h3>
      @if (sharedProfiles.isLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else if (sharedProfiles.value().length === 0) {
        <p class="share-empty">{{ t('share.noOne') }}</p>
      } @else {
        <ul class="share-list">
          @for (profile of sharedProfiles.value(); track profile.userId) {
            <li>
              <span>{{ profile.displayName || profile.email || profile.userId }}</span>
              <button type="button" class="link-button" [disabled]="isWorking()" (click)="unshare(profile.userId)">
                {{ t('actions.remove') }}
              </button>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class RecipeShare {
  private readonly recipeService = inject(RecipeService);
  private readonly userProfileService = inject(UserProfileService);

  readonly recipe = input.required<Recipe>();

  /** Working copy of shared user ids; resets if the recipe input changes. */
  private readonly sharedUserIds = linkedSignal(() => this.recipe().sharedWith);

  protected readonly email = signal('');
  protected readonly isWorking = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly canShare = computed(() => /^\S+@\S+\.\S+$/.test(this.email().trim()));

  protected readonly sharedProfiles = resource({
    params: () => this.sharedUserIds(),
    defaultValue: [] as UserProfile[],
    loader: async ({ params }) => {
      const profiles = await Promise.all(params.map((userId) => this.userProfileService.getProfile(userId)));
      return profiles.filter((profile): profile is UserProfile => profile !== null);
    },
  });

  async share(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canShare()) {
      return;
    }
    this.errorKey.set(null);
    this.isWorking.set(true);
    try {
      const profile = await this.userProfileService.findByEmail(this.email());
      if (!profile) {
        this.errorKey.set('share.userNotFound');
        return;
      }
      if (profile.userId === this.recipe().authorId) {
        this.errorKey.set('share.cannotShareWithSelf');
        return;
      }
      if (this.sharedUserIds().includes(profile.userId)) {
        this.errorKey.set('share.alreadyShared');
        return;
      }
      await this.recipeService.shareWithUser(this.recipe().recipeId, profile.userId);
      this.sharedUserIds.update((ids) => [...ids, profile.userId]);
      this.email.set('');
    } catch {
      this.errorKey.set('share.failed');
    } finally {
      this.isWorking.set(false);
    }
  }

  async unshare(userId: string): Promise<void> {
    this.isWorking.set(true);
    try {
      await this.recipeService.unshareWithUser(this.recipe().recipeId, userId);
      this.sharedUserIds.update((ids) => ids.filter((id) => id !== userId));
    } catch {
      this.errorKey.set('share.failed');
    } finally {
      this.isWorking.set(false);
    }
  }
}
