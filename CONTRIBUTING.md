# How we work

## Branches

| Branch | What it is | Can you push to it? |
|---|---|---|
| `main` | Submission-ready. Only `develop` merges here, at the end of a stage. | **No. Never.** |
| `develop` | The shared working branch. Everyone's finished work lands here. | **Not directly** — only through a reviewed pull request |
| `<name>/<feature>` | Your own branch. Where you actually work. | Yes, freely |

**Do not touch `main`.**

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
  develop
     │
     ├──► 1. git checkout develop
     │       git pull
     │       git checkout -b sithmi/m6-offline-sync
     │
     │    2. work, commit as you go
     │
     │    3. git push -u origin sithmi/m6-offline-sync
     │
     │    4. open a PR:  your branch ──► develop
     │
     │    5. your review partner reviews it
     │
     ◄──── 6. partner approves → YOU merge it
             then delete the branch
```

### Step by step

```bash
# 1. start from the latest develop
git checkout develop
git pull

# 2. branch
git checkout -b sithmi/m6-offline-sync

# 3. work, committing as you go
git add .
git commit -m "Add outbox table and pending-event query"

# 4. push
git push -u origin sithmi/m6-offline-sync
```

Then open a pull request on GitHub with **base `develop`**, never `main`.

Tag your review partner. When they approve, **you** merge it, then delete the branch.

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

- Does it do what the PR says, and nothing else?
- Does it stay inside the author's own module?
- Does it use `packages/shared` types rather than redefining them?
- Does it use the shared components from `packages/ui`?
- POS code: does it still work with **no network**?
- Anything touching money or stock: is the arithmetic right?

Approve, or ask for changes with a reason. "Looks good" without reading it helps nobody.

## Rules

1. **Never push to `main`.**
2. **Never push straight to `develop`** — always a PR.
3. **Never merge your own PR without an approval.**
4. **Never edit another module's code.** Raise it with the owner. The only exception is the
   agreed M5–M6 pairing on the sync engine.
5. **Pull `develop` before you branch**, and again before you open the PR.
6. **API contracts in `packages/shared` are frozen after week 1.** If you must change one, tell
   every module that imports it *before* you merge.
7. **Keep PRs small.** One feature. Easier to review, easier to fix.

## Commit messages

```
Add partial-return pro-rata calculator
Fix balance not refreshing after a credit payment
```

Present tense, says what it does. Not "update", "fix stuff", or "asdf".

## If something goes wrong

| Problem | What to do |
|---|---|
| Pushed to `main` by accident | Tell the group immediately. Do not try to hide it |
| Conflict with `develop` | `git checkout develop && git pull`, then `git merge develop` into your branch and resolve locally |
| You need someone else's unfinished work | Do not copy their code. Ask them to merge to `develop` first, or work against the seed data |
| Your partner has not reviewed in 24 h | Ask the next person in the ring and note it in the PR |
