# ROADMAP.md — Cookbook product roadmap

This file is the **durable strategy**: the product thesis and the Now / Next / Later
horizons. The **live, actionable backlog lives in [GitHub Issues](https://github.com/Amit775/cook-book/issues)** —
one issue per feature, with a `status:` label tracking where it sits in the
[delivery pipeline](AGENTS.md). This file changes rarely; the issues change constantly.

> Split by stable vs. stateful: strategy here (reviewed, versioned), task state in Issues
> (status labels, comments, auto-close on merge). Keep each fact in one place.

## Product thesis

Most recipe apps are *content consumption* — you read someone's blog wrapped in ads.
Cookbook is built on a more interesting idea: **recipes as forkable, versioned, personal
objects** (clone family via `rootId` / `parentId`, owned edits, never co-edit). That is
"GitHub for recipes." Combined with a strong **in-kitchen experience** (cooking mode,
wake-lock, serving scaler, step timers) and a **Hebrew-first / RTL** footing the big players
serve poorly, there are two wedges to lean into:

1. **The best in-kitchen cooking experience** — where the app already leads.
2. **A personal, remixable recipe library** — the fork graph nobody else has.

Everything below either fixes the basic loop (you can't find a recipe today) or deepens one
of those two wedges.

## Horizons

Horizons map to GitHub **milestones**. Themes and sizes map to **labels**.

### Now — fix the core loop

| Issue | Feature | Theme | Size |
|-------|---------|-------|------|
| [#12](https://github.com/Amit775/cook-book/issues/12) | Recipe search & filters | discover | M |
| [#13](https://github.com/Amit775/cook-book/issues/13) | Save / favorite + collections | discover | M |
| [#14](https://github.com/Amit775/cook-book/issues/14) | Clean up orphaned cover photos in Storage | foundation | S |

### Next — reasons to return weekly

**Grocery list epic** — turn recipes into managed, checkable, organized shopping lists that persist per user. Built incrementally; #15 (core) ships and stands alone, the rest layer on:

| Issue | Feature | Theme | Size |
|-------|---------|-------|------|
| [#15](https://github.com/Amit775/cook-book/issues/15) | Shopping lists: core & generation | plan-cook | L |
| [#29](https://github.com/Amit775/cook-book/issues/29) | Shopping list: manual reordering (drag + keyboard) | plan-cook | M |
| [#30](https://github.com/Amit775/cook-book/issues/30) | Shopping list: sections / grouping by aisle | plan-cook | L |
| [#31](https://github.com/Amit775/cook-book/issues/31) | Build a list from multiple recipes at once | plan-cook | M |
| [#32](https://github.com/Amit775/cook-book/issues/32) | Ingredient categories in the catalog | foundation | M |

| Issue | Feature | Theme | Size |
|-------|---------|-------|------|
| [#16](https://github.com/Amit775/cook-book/issues/16) | Weekly meal planner | plan-cook | L |
| [#17](https://github.com/Amit775/cook-book/issues/17) | AI recipe import (paste / URL) | reach | M |
| [#18](https://github.com/Amit775/cook-book/issues/18) | Ratings & reviews | social | M |

### Later — differentiate & reach

| Issue | Feature | Theme | Size |
|-------|---------|-------|------|
| [#19](https://github.com/Amit775/cook-book/issues/19) | Public profiles, follow & recipe fork graph | social | L |
| [#20](https://github.com/Amit775/cook-book/issues/20) | Nutrition estimates | reach | M |
| [#21](https://github.com/Amit775/cook-book/issues/21) | Offline PWA + print / export | plan-cook | M |
| [#22](https://github.com/Amit775/cook-book/issues/22) | SEO/SSR + product analytics | foundation | M |
| [#23](https://github.com/Amit775/cook-book/issues/23) | Ingredient substitute suggestions | reach | M |

## Status workflow

Each open issue carries **exactly one `status:` label** — its position in the pipeline. When
work moves it forward, **remove the old label and add the new one** in one step:

```
gh issue edit <n> --remove-label status:to-plan --add-label status:planned
```

```
status:to-plan ─► status:planned ─►(gate 1)─► status:plan-approved ─► status:doing ─► status:to-review ─┬─► status:review-approved ─►(gate 2)─► merged & closed
                                                                                                          └─► status:changes-requested ─► status:doing ─► …
```

| Status | Means | Who moves it next |
|--------|-------|-------------------|
| `status:to-plan` | ready to be planned | Planner |
| `status:planned` | plan posted as a comment; awaiting plan approval | **user (gate 1)** |
| `status:plan-approved` | plan approved; ready to build | Implementer |
| `status:doing` | Implementer building (also acts as a lock) | Implementer |
| `status:to-review` | PR open (`Closes #<n>`); awaiting review | Reviewer |
| `status:review-approved` | approved; awaiting merge | **user (gate 2)** |
| `status:changes-requested` | changes requested; back to the Implementer | Implementer |

- The **plan** and the **review verdict** live as **issue comments** (the body stays the spec).
- Merging the PR (it carries `Closes #<n>`) **auto-closes** the issue — closed = done, no `done` label.
- The two **user gates** match the pipeline in [AGENTS.md](AGENTS.md): gate 1 approves the plan
  (`planned → plan-approved`); gate 2 is the merge of a `review-approved` issue.

## Useful queries

```
gh issue list --label status:to-plan          # ready to plan
gh issue list --label status:planned           # waiting on your plan approval (gate 1)
gh issue list --label status:plan-approved      # ready to implement
gh issue list --label status:to-review          # waiting on review
gh issue list --label status:review-approved    # ready for you to merge (gate 2)
gh issue list --milestone Now                    # everything in the current horizon
gh issue view <n> --comments                     # one feature's plan + review history
```

## Legend

- **Milestones (horizons):** `Now`, `Next`, `Later`.
- **Theme labels:** `theme:discover`, `theme:plan-cook`, `theme:social`, `theme:reach`, `theme:foundation`.
- **Size labels:** `size:S`, `size:M`, `size:L`.
- **Status labels:** the seven `status:*` above (one per open issue).

New backlog items use the **Feature** issue template (`.github/ISSUE_TEMPLATE/feature.yml`),
which seeds `status:to-plan` automatically. Add a theme + size label when filing.
