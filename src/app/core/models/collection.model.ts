import { DocumentData } from 'firebase/firestore';

export interface RecipeCollection {
  /** Firestore document id. */
  collectionId: string;
  name: string;
  /** Ordered list of recipe ids that belong to this collection. */
  recipeIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The user-editable fields of a collection. `collectionId`, `createdAt`, and
 * `updatedAt` are assigned by the data layer, not the editor.
 */
export type RecipeCollectionDraft = Pick<RecipeCollection, 'name'>;

/** Map a Firestore document snapshot to a `RecipeCollection`, applying defensive defaults. */
export function toRecipeCollection(collectionId: string, data: DocumentData): RecipeCollection {
  return {
    collectionId,
    name: data['name'] ?? '',
    recipeIds: data['recipeIds'] ?? [],
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

function toDate(value: unknown): Date {
  if (
    value !== null &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date();
}
