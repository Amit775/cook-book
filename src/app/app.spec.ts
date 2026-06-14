import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';

import { App } from './app';
import { TranslationLoader } from './core/i18n/transloco-loader';
import { SessionStore } from './core/state/session.store';

const sessionStoreStub = {
  isAuthenticated: signal(false),
  signOut: () => Promise.resolve(),
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTransloco({
          config: { availableLangs: ['he', 'en'], defaultLang: 'he' },
          loader: TranslationLoader,
        }),
        { provide: SessionStore, useValue: sessionStoreStub },
      ],
    }).compileComponents();
  });

  it('should create the shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
