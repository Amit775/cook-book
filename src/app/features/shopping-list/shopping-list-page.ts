import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { form, FormField, minLength, required } from '@angular/forms/signals';

import { formatQuantity } from '../../core/models/quantity.model';
import { isRecipeUnit } from '../../core/models/recipe-unit.model';
import { ShoppingListStore } from '../../core/state/shopping-list.store';
import { SessionStore } from '../../core/state/session.store';

let nextPageId = 0;

@Component({
  selector: 'app-shopping-list-page',
  imports: [TranslocoDirective, RouterLink, FormField],
  template: `
    <section class="page" *transloco="let t">
      <h1>{{ t('shoppingList.heading') }}</h1>

      @if (!isSignedIn()) {
        <p>{{ t('common.signInRequired') }}</p>
        <a routerLink="/login" class="button button--primary">{{ t('actions.signIn') }}</a>
      } @else if (isLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else {
        <!-- List switcher + new list creation -->
        <div class="shopping-list-controls">
          @if (lists().length > 0) {
            <label [for]="ids.listSelect" class="visually-hidden">{{ t('shoppingList.selectList') }}</label>
            <select
              [id]="ids.listSelect"
              class="search-bar-select"
              [value]="activeListId()"
              (change)="onListSelectChange($event)"
            >
              @for (list of lists(); track list.listId) {
                <option [value]="list.listId">{{ list.name }}</option>
              }
              <option value="__new__">{{ t('shoppingList.newOption') }}</option>
            </select>
          }

          <!-- Create list form (shown when no lists exist OR when New is selected) -->
          @if (showingCreateForm() || lists().length === 0) {
            <div class="new-list-inline">
              <label [for]="ids.createInput" class="visually-hidden">{{ t('shoppingList.newListPlaceholder') }}</label>
              <input
                [id]="ids.createInput"
                type="text"
                class="collection-name-input"
                [placeholder]="t('shoppingList.newListPlaceholder')"
                [formField]="createListForm.name"
                (keydown.escape)="cancelCreate()"
                (keydown.enter)="onCreateSubmit()"
              />
              <button
                type="button"
                class="button button--primary"
                [disabled]="createListForm.name().invalid() || isCreatingList()"
                (click)="onCreateSubmit()"
              >
                {{ t('shoppingList.createList') }}
              </button>
              @if (lists().length > 0) {
                <button type="button" class="button" (click)="cancelCreate()">
                  {{ t('actions.cancel') }}
                </button>
              }
            </div>
          }
        </div>

        @if (activeList(); as list) {
          <!-- Rename + delete actions for active list -->
          <div class="shopping-list-header">
            @if (showingRenameForm()) {
              <div class="rename-inline">
                <label [for]="ids.renameInput" class="visually-hidden">{{ t('shoppingList.rename') }}</label>
                <input
                  [id]="ids.renameInput"
                  type="text"
                  class="collection-name-input"
                  [formField]="renameForm.name"
                  (keydown.escape)="cancelRename()"
                  (keydown.enter)="onRenameSubmit(list.listId)"
                />
                <button
                  type="button"
                  class="button button--primary"
                  [disabled]="renameForm.name().invalid() || isRenamingList()"
                  (click)="onRenameSubmit(list.listId)"
                >
                  {{ t('shoppingList.rename') }}
                </button>
                <button type="button" class="button" (click)="cancelRename()">
                  {{ t('actions.cancel') }}
                </button>
              </div>
            } @else {
              <div class="list-actions-row">
                <button type="button" class="button" (click)="startRename(list.name)">
                  {{ t('shoppingList.rename') }}
                </button>
                <button type="button" class="button button--danger" (click)="requestDeleteList()">
                  {{ t('shoppingList.deleteList') }}
                </button>
              </div>
            }
          </div>

          @if (confirmingDeleteList()) {
            <div class="delete-confirm" role="alertdialog" aria-live="assertive">
              <p>{{ t('shoppingList.deleteConfirm') }}</p>
              <div class="recipe-detail-actions">
                <button
                  type="button"
                  class="button button--danger"
                  [disabled]="isDeletingList()"
                  (click)="confirmDeleteList(list.listId)"
                >
                  {{ t('shoppingList.deleteList') }}
                </button>
                <button type="button" class="button" [disabled]="isDeletingList()" (click)="cancelDeleteList()">
                  {{ t('actions.cancel') }}
                </button>
              </div>
            </div>
          }

          <!-- Item count (live region) -->
          <div aria-live="polite" aria-atomic="true" class="visually-hidden">
            {{
              itemCount() === 1
                ? t('shoppingList.itemCountOne')
                : t('shoppingList.itemCountOther', { count: itemCount() })
            }}
          </div>

          @if (displayItems().length === 0) {
            <p class="empty-state">{{ t('shoppingList.emptyList') }}</p>
          } @else {
            <!-- Clear list -->
            <div class="clear-list-row">
              <button type="button" class="button" (click)="requestClearList()">
                {{ t('shoppingList.clear') }}
              </button>
            </div>

            @if (confirmingClearList()) {
              <div class="delete-confirm" role="alertdialog" aria-live="assertive">
                <p>{{ t('shoppingList.clearConfirm') }}</p>
                <div class="recipe-detail-actions">
                  <button type="button" class="button button--danger" (click)="confirmClearList()">
                    {{ t('shoppingList.clear') }}
                  </button>
                  <button type="button" class="button" (click)="cancelClearList()">
                    {{ t('actions.cancel') }}
                  </button>
                </div>
              </div>
            }

            <!-- Shopping list checklist -->
            <ul class="shopping-list-items">
              @for (item of displayItems(); track item.name + '|' + item.unit; let i = $index) {
                <li class="shopping-list-item" [class.is-checked]="item.checked">
                  <label class="item-label">
                    <input
                      type="checkbox"
                      [checked]="item.checked"
                      (change)="onItemToggle(i)"
                    />
                    <span class="item-name">{{ item.name }}</span>
                    @if (item.quantity !== null || item.unit) {
                      <span class="item-amount">
                        {{ formatQuantity(item.quantity) }}
                        {{ isKnownUnit(item.unit) ? t('unit.' + item.unit) : item.unit }}
                      </span>
                    }
                  </label>
                </li>
              }
            </ul>
          }
        } @else if (lists().length === 0 && !showingCreateForm()) {
          <p class="empty-state">{{ t('shoppingList.emptyNoLists') }}</p>
        }
      }
    </section>
  `,
})
export class ShoppingListPage implements OnInit {
  private readonly shoppingListStore = inject(ShoppingListStore);
  private readonly session = inject(SessionStore);

  protected readonly isSignedIn = this.session.isAuthenticated;
  protected readonly isLoading = this.shoppingListStore.isLoading;
  protected readonly lists = this.shoppingListStore.lists;
  protected readonly activeListId = this.shoppingListStore.activeListId;
  protected readonly activeList = this.shoppingListStore.activeList;
  protected readonly displayItems = this.shoppingListStore.displayItems;
  protected readonly itemCount = this.shoppingListStore.itemCount;

  protected readonly showingCreateForm = signal(false);
  protected readonly showingRenameForm = signal(false);
  protected readonly confirmingDeleteList = signal(false);
  protected readonly confirmingClearList = signal(false);
  protected readonly isCreatingList = signal(false);
  protected readonly isRenamingList = signal(false);
  protected readonly isDeletingList = signal(false);

  protected readonly formatQuantity = formatQuantity;
  protected readonly isKnownUnit = isRecipeUnit;

  private readonly uid = `shopping-list-${nextPageId++}`;
  protected readonly ids = {
    listSelect: `${this.uid}-list-select`,
    createInput: `${this.uid}-create-input`,
    renameInput: `${this.uid}-rename-input`,
  };

  // Signal Forms: each form is backed by a WritableSignal model so we can reset it.
  private readonly createListModel = signal({ name: '' });
  protected readonly createListForm = form(this.createListModel, (path) => {
    required(path.name);
    minLength(path.name, 2);
  });

  private readonly renameModel = signal({ name: '' });
  protected readonly renameForm = form(this.renameModel, (path) => {
    required(path.name);
    minLength(path.name, 2);
  });

  async ngOnInit(): Promise<void> {
    if (this.session.isAuthenticated()) {
      await this.shoppingListStore.loadLists();
    }
  }

  protected onListSelectChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === '__new__') {
      this.showingCreateForm.set(true);
      // Reset the select back to the currently active list
      (event.target as HTMLSelectElement).value = this.activeListId() ?? '';
    } else if (value) {
      this.shoppingListStore.setActiveList(value);
    }
  }

  protected cancelCreate(): void {
    this.showingCreateForm.set(false);
    this.createListModel.set({ name: '' });
  }

  protected async onCreateSubmit(): Promise<void> {
    const name = this.createListModel().name.trim();
    if (name.length < 2) {
      return;
    }
    this.isCreatingList.set(true);
    try {
      await this.shoppingListStore.createList(name);
      this.showingCreateForm.set(false);
      this.createListModel.set({ name: '' });
    } finally {
      this.isCreatingList.set(false);
    }
  }

  protected startRename(currentName: string): void {
    this.renameModel.set({ name: currentName });
    this.showingRenameForm.set(true);
  }

  protected cancelRename(): void {
    this.showingRenameForm.set(false);
    this.renameModel.set({ name: '' });
  }

  protected async onRenameSubmit(listId: string): Promise<void> {
    const name = this.renameModel().name.trim();
    if (name.length < 2) {
      return;
    }
    this.isRenamingList.set(true);
    try {
      await this.shoppingListStore.renameList(listId, name);
      this.cancelRename();
    } finally {
      this.isRenamingList.set(false);
    }
  }

  protected requestDeleteList(): void {
    this.confirmingDeleteList.set(true);
  }

  protected cancelDeleteList(): void {
    this.confirmingDeleteList.set(false);
  }

  protected async confirmDeleteList(listId: string): Promise<void> {
    this.isDeletingList.set(true);
    try {
      await this.shoppingListStore.deleteList(listId);
      this.confirmingDeleteList.set(false);
    } finally {
      this.isDeletingList.set(false);
    }
  }

  protected requestClearList(): void {
    this.confirmingClearList.set(true);
  }

  protected cancelClearList(): void {
    this.confirmingClearList.set(false);
  }

  protected async confirmClearList(): Promise<void> {
    await this.shoppingListStore.clearActiveList();
    this.confirmingClearList.set(false);
  }

  protected onItemToggle(displayIndex: number): void {
    // displayItems() is sortItemsAlphabetically-sorted — the objects are the same
    // references as in list.items (sort does not deep-clone). Find the original
    // index by reference so toggleItem operates on the correct slot.
    const displayItem = this.displayItems()[displayIndex];
    const rawItems = this.activeList()?.items ?? [];
    const originalIndex = rawItems.indexOf(displayItem);
    void this.shoppingListStore.toggleItem(originalIndex >= 0 ? originalIndex : displayIndex);
  }
}
