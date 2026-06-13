import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { LanguageService } from './core/i18n/language.service';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoDirective],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly languageService = inject(LanguageService);
  protected readonly authService = inject(AuthService);
}
