import { Component, computed, DOCUMENT, inject, input, linkedSignal, resource, signal } from '@angular/core';
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

      @if (shareUrl(); as url) {
        <p class="share-hint">{{ t('share.linkHint') }}</p>
        <div class="share-link-row">
          <input class="share-link-input" type="text" readonly dir="ltr" [value]="url" (focus)="selectAll($event)" />
          <button type="button" class="button button--primary" (click)="copyLink(url)">
            {{ copied() ? t('share.copied') : t('share.copy') }}
          </button>
        </div>
        <button type="button" class="link-button" [disabled]="isWorking()" (click)="removeLink()">
          {{ t('share.removeLink') }}
        </button>
      } @else {
        <p class="share-hint">{{ t('share.createHint') }}</p>
        <button type="button" class="button button--primary" [disabled]="isWorking()" (click)="createLink()">
          {{ t('share.createLink') }}
        </button>
      }

      <h3 class="share-subtitle">{{ t('share.peopleWithAccess') }}</h3>
      @if (sharedProfiles.isLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else if (sharedProfiles.value().length === 0) {
        <p class="share-empty">{{ t('share.noOne') }}</p>
      } @else {
        <ul class="share-list">
          @for (profile of sharedProfiles.value(); track profile.userId) {
            <li>
              <span>{{ profile.displayName || profile.userId }}</span>
              <button type="button" class="link-button" [disabled]="isWorking()" (click)="removeMember(profile.userId)">
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
  private readonly document = inject(DOCUMENT);

  readonly recipe = input.required<Recipe>();

  /** Local working copies; reset if the recipe input changes. */
  private readonly shareId = linkedSignal(() => this.recipe().shareId);
  private readonly sharedUserIds = linkedSignal(() => this.recipe().sharedWith);

  protected readonly isWorking = signal(false);
  protected readonly copied = signal(false);

  protected readonly shareUrl = computed(() => {
    const shareId = this.shareId();
    if (!shareId) {
      return null;
    }
    const origin = this.document.defaultView?.location.origin ?? '';
    return `${origin}/share/${shareId}`;
  });

  protected readonly sharedProfiles = resource({
    params: () => this.sharedUserIds(),
    defaultValue: [] as UserProfile[],
    loader: async ({ params }) => {
      const profiles = await Promise.all(params.map((userId) => this.userProfileService.getProfile(userId)));
      return profiles.filter((profile): profile is UserProfile => profile !== null);
    },
  });

  async createLink(): Promise<void> {
    this.isWorking.set(true);
    try {
      this.shareId.set(await this.recipeService.createShareLink(this.recipe()));
    } finally {
      this.isWorking.set(false);
    }
  }

  async removeLink(): Promise<void> {
    this.isWorking.set(true);
    try {
      await this.recipeService.removeShareLink({ ...this.recipe(), shareId: this.shareId() });
      this.shareId.set(null);
    } finally {
      this.isWorking.set(false);
    }
  }

  async copyLink(url: string): Promise<void> {
    await this.document.defaultView?.navigator.clipboard?.writeText(url);
    this.copied.set(true);
    this.document.defaultView?.setTimeout(() => this.copied.set(false), 2000);
  }

  selectAll(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  async removeMember(userId: string): Promise<void> {
    this.isWorking.set(true);
    try {
      await this.recipeService.unshareWithUser(this.recipe().recipeId, userId);
      this.sharedUserIds.update((ids) => ids.filter((id) => id !== userId));
    } finally {
      this.isWorking.set(false);
    }
  }
}
