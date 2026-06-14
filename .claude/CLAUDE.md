You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

## Cookbook project specifics

This is a recipe-sharing app (meals, desserts, cocktails) with clone-based versioning.

- **Naming:** never abbreviate variable/field names — `quantity` not `qty`, `prepTime`/`cookTime` not `prepMin`/`cookMin`, `userId` not `uid`. Acronyms like `URL`/`ID` are fine.
- **Forms:** use Angular v22 **Signal Forms** for the recipe editor (not Reactive/Template forms).
- **State management:** **`@ngrx/signals`** (SignalStore). Global/shared state goes in a store under `src/app/core/state/` (see `SessionStore`); keep Firebase side effects in stateless services (e.g. `AuthService`). On v21 + `legacy-peer-deps=true` until NgRx publishes v22.
- **Static assets:** do NOT keep a `public/index.html` — Angular generates the shell from `src/index.html`, and a file at `public/index.html` shadows it (a stray one from `firebase init hosting` will break the app).
- **Firebase:** use the official modular SDK (`firebase@12`) directly via the DI tokens in `src/app/core/firebase/firebase.providers.ts` (`FIREBASE_AUTH`, `FIRESTORE`, `FIREBASE_STORAGE`). Do NOT add `@angular/fire` — it does not support Angular v22 yet.
- **Durations:** `prepTime`/`cookTime` are ISO 8601 duration strings (e.g. `PT30M`). Helpers in `src/app/core/models/duration.model.ts`.
- **i18n / RTL:** Hebrew-first, RTL by default. Use Transloco (`*transloco="let t"`) for all user-facing text — add keys to both `public/i18n/he.json` and `public/i18n/en.json`. Use CSS **logical properties** (`margin-inline`, `padding-inline`, `inset-inline`) so layout flips automatically; never hard-code left/right.
- **Auth:** Google + Phone only (`AuthService` in `src/app/core/services`).
- **Sharing model:** clone-only — shared users can view and clone, never co-edit. A clone is a new owned doc linked by `parentId` + `rootId`.
- **Structure:** `core/` (models, services, firebase, i18n), `features/` (lazy-loaded route pages), `shared/` (reusable UI). Feature routes are lazy via `loadComponent`.
- **Security:** Firestore/Storage rules at repo root are the real access boundary — keep them in sync with any new query shapes (queries must filter to what the rules allow, or the whole query is rejected).

## Workflow

- **Branch per phase:** do each phase's work on a feature branch off `main` (e.g. `feature/phase-1-recipes`). Never commit phase work directly to `main`.
- **PR to main:** open a pull request to `main` for each phase.
- **Preview before merge:** deploy a Firebase Hosting **preview channel** for the PR (`firebase hosting:channel:deploy <channel>`) and share the preview URL. Wait for the user's explicit approval before merging.
- `main` is the deployable baseline (what's on the live hosting channel); only merge after approval.
