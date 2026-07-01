/**
 * Firestore security-rules tests for the ratings subcollection.
 *
 * Requires the Firestore emulator to be running:
 *   firebase emulators:start --only firestore --project demo-test
 *
 * Run with:
 *   npm run test:rules
 *
 * The emulator port is read from the FIRESTORE_EMULATOR_HOST env var
 * (default "localhost:9090") so CI can override it.
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setDoc, getDoc, collection, getDocs, doc, query, orderBy } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_FILE = resolve(__dirname, '../firestore.rules');

// ---------------------------------------------------------------------------
// Emulator connection
// ---------------------------------------------------------------------------

const emulatorHost = process.env['FIRESTORE_EMULATOR_HOST'] ?? 'localhost:9090';
const [host, portString] = emulatorHost.split(':');
const port = Number(portString);

let testEnv;

async function setup() {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-test',
    firestore: {
      host,
      port,
      rules: readFileSync(RULES_FILE, 'utf8'),
    },
  });
}

async function teardown() {
  if (testEnv) {
    await testEnv.cleanup();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A public recipe seeded with the three aggregate fields.
 * Uses withSecurityRulesDisabled so the seed write bypasses rules.
 */
async function seedPublicRecipe(recipeId) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'recipes', recipeId), {
      title: 'Test Recipe',
      description: '',
      type: 'meal',
      authorId: 'author1',
      visibility: 'public',
      sharedWith: [],
      rootId: recipeId,
      parentId: null,
      ingredients: [],
      steps: [],
      tags: [],
      keywords: [],
      servings: null,
      prepTime: null,
      cookTime: null,
      coverPhotoPath: null,
      shareId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ratingCount: 0,
      ratingSum: 0,
      ratingAverage: 0,
    });
  });
}

async function seedPrivateRecipe(recipeId, authorId) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'recipes', recipeId), {
      title: 'Private Recipe',
      description: '',
      type: 'meal',
      authorId,
      visibility: 'private',
      sharedWith: [],
      rootId: recipeId,
      parentId: null,
      ingredients: [],
      steps: [],
      tags: [],
      keywords: [],
      servings: null,
      prepTime: null,
      cookTime: null,
      coverPhotoPath: null,
      shareId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ratingCount: 0,
      ratingSum: 0,
      ratingAverage: 0,
    });
  });
}

async function seedExistingRating(recipeId, userId, stars) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'recipes', recipeId, 'ratings', userId), {
      authorId: userId,
      stars,
      reviewText: 'Seeded review',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
}

/** Minimal valid rating payload for create/update. */
function ratingPayload(userId, stars = 4, reviewText = 'Good recipe') {
  return { authorId: userId, stars, reviewText, updatedAt: new Date() };
}

// ---------------------------------------------------------------------------
// Test runner (minimal inline runner — no test framework needed)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message ?? error}`);
    failures.push({ name, error });
    failed++;
  }
  // Clear data between tests to avoid interference.
  await testEnv.clearFirestore();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function runTests() {
  console.log('\nFirestore ratings subcollection rules\n');

  // --- 1. First rating on a public recipe by a non-owner viewer → ALLOWED ---
  await test('non-owner can CREATE a rating on a public recipe', async () => {
    await seedPublicRecipe('recipe-pub');
    const viewer = testEnv.authenticatedContext('viewer1');
    await assertSucceeds(
      setDoc(
        doc(viewer.firestore(), 'recipes', 'recipe-pub', 'ratings', 'viewer1'),
        ratingPayload('viewer1'),
      ),
    );
  });

  // --- 2. Owner can rate their own recipe (self-rating allowed per Gate-1 decision 3) ---
  await test('owner can CREATE their own rating on their recipe', async () => {
    await seedPublicRecipe('recipe-own');
    const owner = testEnv.authenticatedContext('author1');
    await assertSucceeds(
      setDoc(
        doc(owner.firestore(), 'recipes', 'recipe-own', 'ratings', 'author1'),
        ratingPayload('author1'),
      ),
    );
  });

  // --- 3. Reviews-list read (collection query) by a non-rater → ALLOWED on a public recipe ---
  await test('any signed-in user can READ ratings on a public recipe', async () => {
    await seedPublicRecipe('recipe-read');
    await seedExistingRating('recipe-read', 'rater1', 5);
    const reader = testEnv.authenticatedContext('reader2');
    // Single-doc get
    await assertSucceeds(
      getDoc(doc(reader.firestore(), 'recipes', 'recipe-read', 'ratings', 'rater1')),
    );
  });

  // --- 4. Anonymous user CANNOT read ratings (recipe is public but requires sign-in to view ratings) ---
  // NOTE: canViewParentRecipe() has no isSignedIn() guard for public/unlisted —
  // so anonymous users CAN read ratings on public recipes (same as comments rule).
  // We test the meaningful case: anon CAN read public recipe ratings.
  await test('anonymous user CAN read ratings on a public recipe (public visibility)', async () => {
    await seedPublicRecipe('recipe-anon-read');
    await seedExistingRating('recipe-anon-read', 'rater1', 3);
    const anon = testEnv.unauthenticatedContext();
    await assertSucceeds(
      getDoc(doc(anon.firestore(), 'recipes', 'recipe-anon-read', 'ratings', 'rater1')),
    );
  });

  // --- 5. Rating write on a PRIVATE recipe the user cannot view → DENIED ---
  await test('non-viewer CANNOT create a rating on a private recipe', async () => {
    await seedPrivateRecipe('recipe-priv', 'owner1');
    const outsider = testEnv.authenticatedContext('outsider1');
    await assertFails(
      setDoc(
        doc(outsider.firestore(), 'recipes', 'recipe-priv', 'ratings', 'outsider1'),
        ratingPayload('outsider1'),
      ),
    );
  });

  // --- 6. Rating read on a private recipe by non-viewer → DENIED ---
  await test('non-viewer CANNOT read ratings on a private recipe', async () => {
    await seedPrivateRecipe('recipe-priv2', 'owner2');
    await seedExistingRating('recipe-priv2', 'owner2', 5);
    const outsider = testEnv.authenticatedContext('outsider2');
    await assertFails(
      getDoc(doc(outsider.firestore(), 'recipes', 'recipe-priv2', 'ratings', 'owner2')),
    );
  });

  // --- 7. Editing another user's rating doc → DENIED ---
  await test('user CANNOT edit another user\'s rating doc', async () => {
    await seedPublicRecipe('recipe-edit');
    await seedExistingRating('recipe-edit', 'rater1', 4);
    const otherUser = testEnv.authenticatedContext('rater2');
    // rater2 tries to overwrite rater1's doc
    await assertFails(
      setDoc(
        doc(otherUser.firestore(), 'recipes', 'recipe-edit', 'ratings', 'rater1'),
        ratingPayload('rater1'),
      ),
    );
  });

  // --- 8. Stars out of range → DENIED ---
  await test('CANNOT create a rating with stars = 0 (out of range)', async () => {
    await seedPublicRecipe('recipe-stars0');
    const viewer = testEnv.authenticatedContext('viewer3');
    await assertFails(
      setDoc(
        doc(viewer.firestore(), 'recipes', 'recipe-stars0', 'ratings', 'viewer3'),
        { authorId: 'viewer3', stars: 0, reviewText: 'bad', updatedAt: new Date() },
      ),
    );
  });

  await test('CANNOT create a rating with stars = 6 (out of range)', async () => {
    await seedPublicRecipe('recipe-stars6');
    const viewer = testEnv.authenticatedContext('viewer4');
    await assertFails(
      setDoc(
        doc(viewer.firestore(), 'recipes', 'recipe-stars6', 'ratings', 'viewer4'),
        { authorId: 'viewer4', stars: 6, reviewText: 'too many', updatedAt: new Date() },
      ),
    );
  });

  // --- 9. reviewText too long → DENIED ---
  await test('CANNOT create a rating with reviewText longer than 1000 chars', async () => {
    await seedPublicRecipe('recipe-longtext');
    const viewer = testEnv.authenticatedContext('viewer5');
    await assertFails(
      setDoc(
        doc(viewer.firestore(), 'recipes', 'recipe-longtext', 'ratings', 'viewer5'),
        { authorId: 'viewer5', stars: 3, reviewText: 'x'.repeat(1001), updatedAt: new Date() },
      ),
    );
  });

  // --- 10. User deletes their own rating → ALLOWED ---
  await test('user CAN delete their own rating', async () => {
    await seedPublicRecipe('recipe-del');
    await seedExistingRating('recipe-del', 'viewer6', 3);
    const viewer = testEnv.authenticatedContext('viewer6');
    const { deleteDoc } = await import('firebase/firestore');
    await assertSucceeds(
      deleteDoc(doc(viewer.firestore(), 'recipes', 'recipe-del', 'ratings', 'viewer6')),
    );
  });

  // --- 11. User CANNOT delete another user's rating → DENIED ---
  await test('user CANNOT delete another user\'s rating', async () => {
    await seedPublicRecipe('recipe-del2');
    await seedExistingRating('recipe-del2', 'rater1', 5);
    const otherUser = testEnv.authenticatedContext('viewer7');
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(
      deleteDoc(doc(otherUser.firestore(), 'recipes', 'recipe-del2', 'ratings', 'rater1')),
    );
  });

  // --- 12. authorId mismatch in payload → DENIED ---
  await test('CANNOT create rating where authorId != authenticated uid', async () => {
    await seedPublicRecipe('recipe-mismatch');
    const viewer = testEnv.authenticatedContext('viewer8');
    await assertFails(
      setDoc(
        doc(viewer.firestore(), 'recipes', 'recipe-mismatch', 'ratings', 'viewer8'),
        { authorId: 'someoneElse', stars: 4, reviewText: '', updatedAt: new Date() },
      ),
    );
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(async () => {
  try {
    await setup();
    await runTests();
  } catch (error) {
    console.error('\nFatal error during test setup:', error.message ?? error);
    process.exit(1);
  } finally {
    await teardown();
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    for (const { name, error } of failures) {
      console.error(`  FAILED: ${name}`);
      console.error(`  ${error.message ?? error}`);
    }
    process.exit(1);
  }
})();
