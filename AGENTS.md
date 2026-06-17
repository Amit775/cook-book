# AGENTS.md — Cookbook delivery workflow

This file defines **how work moves from a task to a merged PR** in the Cookbook app, using a
small team of specialized sub-agents. It is the human-readable workflow; the invocable role
definitions live in `.claude/agents/` and the project coding conventions live in `.claude/CLAUDE.md`.

> **Separation of concerns:** the *what* (conventions, stack, naming, RTL, Firebase) is in
> `CLAUDE.md`. The *how* (the pipeline below) is here. The *roles* are the three files in
> `.claude/agents/`. Keep each fact in exactly one place and link, don't duplicate.

## The roles

| Role | File | Mode | May do | May NOT do |
|------|------|------|--------|------------|
| **Planner** | `.claude/agents/planner.md` | read-only | explore code, write a plan | edit code, open PRs |
| **Implementer** | `.claude/agents/implementer.md` | read-write | code, verify, commit, push, open PR, resolve review comments | commit to `main`, merge, deploy |
| **Reviewer** | `.claude/agents/reviewer.md` | read-only | read the PR diff, run build/tests, issue a verdict | edit code, merge |

**Models** (pinned in each role's frontmatter `model:` field):

- **Planner → Opus** — architecture reasoning and risk-spotting; high leverage, low token volume.
- **Implementer → Sonnet** — fast, strong coding for the high-volume build/verify/resolve grind, already bounded by an approved plan and caught by review.
- **Reviewer → Opus** — the quality gate; at least as sharp as the code it inspects, for subtle bugs, security, and convention drift.

The **orchestrator** is the top-level assistant (the main Claude Code session). It spawns the
agents, carries artifacts between them, runs the gates with the user, and performs the merge.

## The pipeline

```
task
  │
  ▼
[1] Planner ──► implementation plan
  │
  ▼
══ GATE 1: plan approval (user) ══════════════════  ◄── you sign off before any code is written
  │
  ▼
[2] Implementer ──► feature branch + verified code + PR to main
  │
  ▼
[3] Reviewer ──► verdict (APPROVE | REQUEST CHANGES)
  │
  ├─ REQUEST CHANGES ─► [4] Implementer resolves ─► back to [3]   (loop, max 3 rounds)
  │
  ▼  (APPROVE)
══ GATE 2: pre-merge approval (user) ═════════════  ◄── you give the final OK
  │
  ▼
[5] Orchestrator merges to main (CI deploys hosting) + deploys rules if changed
```

### Stage notes

1. **Plan.** Orchestrator spawns the **Planner** with the task. It returns a structured plan.
2. **Gate 1 — plan approval.** Orchestrator presents the plan to the user. Nothing is built
   until the user approves (or amends) it. Open questions from the plan are resolved here.
3. **Implement.** Orchestrator spawns the **Implementer** with the approved plan. It branches,
   builds, verifies, and opens the PR. **Keep this agent's id** — it is reused for resolve rounds.
4. **Review.** Orchestrator spawns the **Reviewer** with the PR number. It returns a verdict.
5. **Resolve loop.** On `REQUEST CHANGES`, the orchestrator **continues the same Implementer
   agent** (via `SendMessage` to its id, so its context stays warm) with the review comments.
   The Implementer pushes fixes; the Reviewer re-reviews. Repeat until `APPROVE`.
6. **Gate 2 — pre-merge approval.** On `APPROVE`, the orchestrator asks the user for the final
   OK to merge.
7. **Merge.** Orchestrator merges to `main` (CI deploys hosting) and, if rules changed, runs
   `firebase deploy --only firestore:rules,storage` (CI does not deploy rules).

## The backlog & status labels

The task queue lives in **GitHub Issues**, not in any one session's memory. Each issue is one
plannable feature; its **`status:` label** is its position in the pipeline above; the **plan and
the review verdict are posted as issue comments** (the body stays the spec). The durable strategy
— thesis and Now / Next / Later horizons — lives in [`ROADMAP.md`](ROADMAP.md).

The status labels are a single state machine: **exactly one `status:` label per open issue.**
Whenever work moves an issue, **remove the old `status:` label and add the new one in the same
step** (`gh issue edit <n> --remove-label status:X --add-label status:Y`).

| Status | Means | Who moves it next |
|--------|-------|-------------------|
| `status:to-plan` | ready to be planned | Planner |
| `status:planned` | plan posted as a comment; awaiting plan approval | **user (gate 1)** |
| `status:plan-approved` | plan approved; ready to build | Implementer |
| `status:doing` | Implementer building (also a lock) | Implementer |
| `status:to-review` | PR open (`Closes #<n>`); awaiting review | Reviewer |
| `status:review-approved` | approved; awaiting merge | **user (gate 2)** |
| `status:changes-requested` | changes requested; back to the Implementer | Implementer |

Merging the PR (it carries `Closes #<n>`) **auto-closes** the issue = done. The two **user gates**
are the same gates as in the pipeline: gate 1 is `planned → plan-approved`, gate 2 is the merge of
a `review-approved` issue.

**Who writes to GitHub** (matches each role's tools):

- The **Planner** is read-only (no `gh`). It returns the plan as its final message; the
  **orchestrator** posts that as the issue comment and moves `to-plan → planned`.
- The **orchestrator** owns the two user-gated moves: after gate 1 it sets `planned → plan-approved`;
  after gate 2 it merges (which auto-closes the issue).
- The **Implementer** owns its own moves: `plan-approved → doing` on pickup, `doing → to-review` when
  it opens the PR (with `Closes #<n>`), and `changes-requested → doing` when it starts a resolve round.
- The **Reviewer** posts its verdict as a comment and sets `to-review → review-approved` (APPROVE) or
  `to-review → changes-requested` (REQUEST CHANGES).

The orchestrator **dequeues** by querying a label (e.g. `gh issue list --label status:plan-approved`),
then spawns the right agent pointed at that issue number. `status:doing` doubles as a lock so two
sessions don't grab the same issue.

## Loop bounds & escalation

- **Max 3 review rounds.** If the Reviewer still requests changes after the third round, the
  orchestrator stops the loop and escalates to the user with both sides' positions. The two
  agents do not negotiate endlessly, and they do not rubber-stamp each other.
- **The Reviewer owns the verdict.** Disagreement is resolved by the Reviewer stating exactly
  what must change to reach APPROVE — or, if it's a judgment call, by escalating to the user.
- **Either agent escalates on a blocker.** A genuine ambiguity or blocker goes back to the user
  rather than being guessed past.

## Recording decisions (so future sessions aren't lost)

Documentation is **not a separate agent** — the orchestrator already holds the context (it ran the
gates and coordinated the build), so it records decisions directly, at specific moments and into the
channel that actually reaches the future reader.

**When to record**

- A **Gate-1 amendment** — the user changed the plan before any code was written.
- A **mid-build divergence** — the Implementer reported that reality contradicted the plan and the
  approach changed.
- A **ruled-out approach** — the review loop established that "we tried X, it failed because Y."

**Where it goes**

- **PR body / commit** — the feature-specific record: what changed versus the approved plan, and why.
  The Implementer notes deviations in the PR body; the orchestrator confirms they're there before merge.
- **Memory** (`MEMORY.md` + the user's `…/memory/` files) — only decisions with *lasting*
  significance: a new convention, a durable constraint, a rejected approach worth not re-trying. This
  is the channel auto-loaded into every future session, so keep it to facts that outlive this PR, and
  don't duplicate what the repo, git history, or `CLAUDE.md` already record.

**Who decides what matters** — the orchestrator. Feature-local detail → PR; cross-cutting and durable
→ memory. If nothing lasting was decided, nothing goes to memory — an empty record is the correct
outcome, not a gap to fill.

## Lightweight path (skip the ceremony)

The full pipeline is for features and non-trivial changes. For **trivial** work — a typo, a copy
tweak, a one-line bugfix, a doc edit — the orchestrator may skip the Planner and the resolve
loop: make the change on a branch, self-review against `CLAUDE.md`, and take it through the two
gates directly. Scale the process to the risk, not the other way around. When in doubt, plan.

## How the orchestrator invokes the roles

- Spawn a fresh role with the `Agent` tool, `subagent_type: "planner" | "implementer" | "reviewer"`.
- Each agent starts **cold** (no memory of the others), so the orchestrator must pass the needed
  context in the prompt: the Planner gets the task; the Implementer gets the **approved plan**;
  the Reviewer gets the **PR number** and the task intent.
- To continue the Implementer for a resolve round, use `SendMessage` with its agent id — do not
  spawn a new one, or it re-derives everything.

## Tuning

- Adjust a role's allowed tools or pin a model in the frontmatter of its `.claude/agents/*.md` file.
- Change the review-round ceiling or the gate placement by editing this file.
- Conventions belong in `CLAUDE.md`; only workflow mechanics belong here.
