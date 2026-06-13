import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-home-page',
  imports: [TranslocoDirective],
  template: `
    <section class="page" *transloco="let t">
      <h1>{{ t('home.heading') }}</h1>
      <p>{{ t('home.subheading') }}</p>
    </section>
  `,
})
export class HomePage {}
