import { Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-recipe-detail-page',
  imports: [TranslocoDirective],
  template: `
    <section class="page" *transloco="let t">
      <p>{{ t('recipeDetail.placeholder') }}</p>
      <p>recipeId: {{ recipeId() }}</p>
    </section>
  `,
})
export class RecipeDetailPage {
  /** Bound from the `:recipeId` route parameter (withComponentInputBinding). */
  readonly recipeId = input<string>('');
}
