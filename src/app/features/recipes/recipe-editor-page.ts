import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-recipe-editor-page',
  imports: [TranslocoDirective],
  template: `
    <section class="page" *transloco="let t">
      <h1>{{ t('create.heading') }}</h1>
      <p>{{ t('create.placeholder') }}</p>
    </section>
  `,
})
export class RecipeEditorPage {}
