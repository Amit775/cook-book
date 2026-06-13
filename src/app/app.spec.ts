import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';

import { App } from './app';
import { TranslationLoader } from './core/i18n/transloco-loader';
import { AuthService } from './core/services/auth.service';

class AuthServiceStub {
  readonly isAuthenticated = () => false;
  signOut = () => Promise.resolve();
}

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
        { provide: AuthService, useClass: AuthServiceStub },
      ],
    }).compileComponents();
  });

  it('should create the shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
