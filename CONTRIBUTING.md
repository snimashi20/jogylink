# How we work

## Branches

| Branch | What it is | Can you push to it? |
|---|---|---|
| `final` | Verified release. Only `main` is promoted here, and only after a release has been tested end to end. | **No. Never.** |
| `main` | The shared working branch. Everyone's finished work lands here. | **Not directly** — only through a reviewed pull request |
| `<name>/<feature>` | Your own branch. Where you actually work. | Yes, freely |

**Do not push to `main` or `final`.** Both are protected on GitHub: direct pushes, force
pushes and branch deletion are blocked, and every pull request needs one approval.

## Naming your branch

```
<your-name>/<module>-<feature>
```

Lower case, hyphens, no spaces. Examples:

```
sithmi/m6-offline-sync
sithmi/m6-credit-ledger
nimal/m3-expiry-classifier
```

One branch per feature, not one branch per person for the whole project. Small branches get
reviewed quickly; a branch with three weeks of work in it does not.

## The cycle

```
  main
     │
     ├──► 1. git checkout main
     │       git pull
     │       git checkout -b sithmi/m6-offline-sync
     │
     │    2. work, commit as you go
     │
     │    3. git push -u origin sithmi/m6-offline-sync
     │
     │    4. open a PR:  your branch ──► main
     │
     │    5. CI runs; your review partner reviews it
     │
     ◄──── 6. CI green + partner approves → YOU squash and merge
             then delete the branch
```

### Step by step

```bash
# 1. start from the latest main
git checkout main
git pull

# 2. branch
git checkout -b sithmi/m6-offline-sync

# 3. work, committing as you go
git add .
git commit -m "Add outbox table and pending-event query"

# 4. push
git push -u origin sithmi/m6-offline-sync
```

Then open a pull request on GitHub with **base `main`**, never `final`.

Tag your review partner. When CI is green and they approve, **you** merge it, then delete the
branch.

### Merge with "Squash and merge"

`main` requires linear history, so GitHub will **reject "Create a merge commit"**. Use
**Squash and merge** (or rebase) and your whole branch lands as one commit on `main`.

## CI: what has to pass

Every pull request into `main` or `final` runs the `check` job in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml), in this order:

```
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

The job stops at the first failure, so a red `typecheck` means the tests and build **have not
run yet** — fixing the types can still reveal more. Run the same commands locally before you
push; they are the same commands CI runs.

Never make a check pass by removing it from the workflow.

## Promoting a release into `final`

`final` is not a working branch and is not kept in step with `main`. You promote into it only
when there is something worth submitting:

1. CI is green on `main`.
2. The whole application actually runs — API, web and POS.
3. The database migrates and seeds from empty.
4. The important user workflows have been walked through by hand, not just unit tested.
5. Then open a pull request **`main` ──► `final`**, and say in the description what you tested.

M1 opens this PR. Do not promote a version nobody has run.

## Review partners

Review is in a ring, so nobody waits on one person and nobody reviews their own reviewer only.

| You | Your work is reviewed by | You review |
|---|---|---|
| **M1** | M2 | M8 |
| **M2** | M3 | M1 |
| **M3** | M4 | M2 |
| **M4** | M5 | M3 |
| **M5** | M6 | M4 |
| **M6** | M7 | M5 |
| **M7** | M8 | M6 |
| **M8** | M1 | M7 |

**Pairs that touch each other's work are adjacent on purpose:** M5 and M6 share the sync engine,
M2 and M3 share batches and expiry, M7 and M8 share returns and delivery. Your reviewer is
usually the person most affected if you get it wrong.

If your partner is unavailable for more than **24 hours**, ask the next person in the ring and
say so in the PR.

## Reviewing: what to check

- Is CI green? Do not approve a red pull request.
- Does it do what the PR says, and nothing else?
- Does it stay inside the author's own module?
- Does it use `packages/shared` types rather than redefining them?
- Does it use the shared components from `packages/ui`?
- POS code: does it still work with **no network**?
- Anything touching money or stock: is the arithmetic right?

Approve, or ask for changes with a reason. "Looks good" without reading it helps nobody.

## Rules

1. **Never push to `main` or `final`.**
2. **Always a pull request**, with base `main` for feature work.
3. **Never merge your own PR without an approval.**
4. **Never merge a red pull request.**
5. **Never edit another module's code.** Raise it with the owner. The only exception is the
   agreed M5–M6 pairing on the sync engine.
6. **Pull `main` before you branch**, and again before you open the PR.
7. **API contracts in `packages/shared` are frozen after week 1.** If you must change one, tell
   every module that imports it *before* you merge.
8. **Keep PRs small.** One feature. Easier to review, easier to fix.

## Commit messages

```
Add partial-return pro-rata calculator
Fix balance not refreshing after a credit payment
```

Present tense, says what it does. Not "update", "fix stuff", or "asdf".

## If something goes wrong

| Problem | What to do |
|---|---|
| Pushed to `main` by accident | The ruleset should have blocked it. If it got through, tell the group immediately. Do not try to hide it |
| Conflict with `main` | `git checkout main && git pull`, then `git merge main` into your branch and resolve locally, and push |
| GitHub says "merge commit not allowed" | Use **Squash and merge**. `main` requires linear history |
| CI is red and you do not understand why | Open the failing step in the Actions tab and read the first error, not the last. Ask in the group chat with that error |
| You need someone else's unfinished work | Do not copy their code. Ask them to merge to `main` first, or work against the seed data |
| Your partner has not reviewed in 24 h | Ask the next person in the ring and note it in the PR |
