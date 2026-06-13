import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-library-page',
  imports: [TranslocoDirective],
  template: `
    <section class="page" *transloco="let t">
      <h1>{{ t('library.heading') }}</h1>
      <p>{{ t('library.placeholder') }}</p>
    </section>
  `,
})
export class LibraryPage {}
