import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export type AppLanguage = 'he' | 'en';

const RTL_LANGUAGES: ReadonlySet<AppLanguage> = new Set<AppLanguage>(['he']);
const STORAGE_KEY = 'cookbook.language';

/**
 * Owns the active UI language and keeps the document `lang`/`dir` attributes in
 * sync, so the layout flips between RTL (Hebrew) and LTR (English) correctly.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translocoService = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  readonly currentLanguage = signal<AppLanguage>(this.readInitialLanguage());

  constructor() {
    this.applyLanguage(this.currentLanguage());
  }

  setLanguage(language: AppLanguage): void {
    this.applyLanguage(language);
    this.currentLanguage.set(language);
    this.document.defaultView?.localStorage.setItem(STORAGE_KEY, language);
  }

  toggleLanguage(): void {
    this.setLanguage(this.currentLanguage() === 'he' ? 'en' : 'he');
  }

  isRightToLeft(language: AppLanguage = this.currentLanguage()): boolean {
    return RTL_LANGUAGES.has(language);
  }

  private applyLanguage(language: AppLanguage): void {
    this.translocoService.setActiveLang(language);
    const direction = this.isRightToLeft(language) ? 'rtl' : 'ltr';
    const documentElement = this.document.documentElement;
    documentElement.setAttribute('lang', language);
    documentElement.setAttribute('dir', direction);
  }

  private readInitialLanguage(): AppLanguage {
    const stored = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'he' ? stored : 'he';
  }
}
