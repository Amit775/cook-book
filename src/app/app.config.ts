import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideFirebase } from './core/firebase/firebase.providers';
import { TranslationLoader } from './core/i18n/transloco-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(),
    provideFirebase(environment.firebase),
    provideTransloco({
      config: {
        availableLangs: ['he', 'en'],
        defaultLang: 'he',
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslationLoader,
    }),
  ],
};
