import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

@Injectable({ providedIn: 'root' })
export class TranslationLoader implements TranslocoLoader {
  private readonly httpClient = inject(HttpClient);

  getTranslation(language: string) {
    return this.httpClient.get<Translation>(`/i18n/${language}.json`);
  }
}
