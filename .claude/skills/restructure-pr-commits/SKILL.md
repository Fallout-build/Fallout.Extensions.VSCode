---
name: restructure-pr-commits
description: "Restructure the commits on an existing PR into focused, reviewable commits"
---

Restructure the commits on PR `<number>` into focused, reviewable commits.
Follow these steps in order exactly.

## 0 — Check this is worth doing at all

```
gh pr view <number> --json baseRefName,title,url
```

**The base branch decides whether commit curation matters.** This repo enforces
linear history with merge commits disabled, and the merge method differs by
direction (`docs/branching-and-release.md#merging`):

- **Base `main`** — merged with **rebase**. Every commit lands on the production
  branch verbatim and becomes a permanent `git bisect` target. Curation matters;
  proceed.
- **Base `develop`** — merged with **squash**. The whole PR collapses to one
  commit no matter how you arrange it. Restructuring is wasted effort — the
  thing that actually needs care is the **PR title**, since that is what lands
  on the trunk and what the release notes quote. Say so and stop, unless the
  user explicitly wants the branch history tidied anyway.

Use the real base ref from that command as `<base>` below — do not assume.

## 1 — Find what the PR actually changes

```
git diff origin/<base> HEAD --stat
```

This is the authoritative list of files the PR modifies. `git log` is misleading
on branches kept up to date via merge: merge commits drag base-branch history
into the log as if it were authored on this branch — it isn't.

## 2 — Find the branch's own commits

```
git log --first-parent --no-merges origin/<base>..HEAD --oneline
```

This shows only commits made directly on this branch.

## 3 — Create a backup branch

```
git branch backup-pr-<number> HEAD
```

Do this before changing anything. Never skip this step.

## 4 — Build the restructured history

Check out a fresh branch from the base:
```
git checkout origin/<base> -b restructured-pr-<number>
```

Then restore the changed files from the backup:
```
git checkout backup-pr-<number> -- <files from step 1>
```

Handle renames explicitly: `git rm <old>` then `git checkout backup-pr-<number> -- <new>`.

Commit in logical groups — one concern per commit. Commit message rules (from
`docs/issue-and-pr-style.md`):
- Functional imperative phrases; no conventional-commit prefixes (`fix:`, `feat:`, etc.)
- Subject completes "This commit will…" without saying so
- Body (when needed) explains *why*, not *what*; no file/class/type names

Do not restructure across the generated/hand-written CI boundary: a change to
`build/Build.CI.GitHubActions.cs` and the regenerated `.github/workflows/build.yml`
belong in the **same** commit. Splitting them leaves a commit where the attribute
and the workflow disagree, which is exactly the state the generated-file rule
exists to prevent.

## 5 — Verify file content is unchanged

Run both and report the output:
```
git diff HEAD backup-pr-<number>
git diff HEAD origin/<base> --stat
```

The first command must produce **no output**; if it does, stop and investigate before continuing.
The second must list **exactly the same files** as step 1.

## 6 — Stop and wait for explicit confirmation

Show the new `git log --oneline` and ask the user to confirm the history looks
correct. Do not proceed until the user explicitly says yes.

## 7 — Push with --force-with-lease only after confirmation

```
git push origin HEAD:<pr-branch-name> --force-with-lease
```

Never use `--force` alone.

## 8 — Update the PR title and description after confirmation

Rewrite the PR title and description to match the restructured commits.
Structure: Summary → one Changes section per commit → optional Combined effect.
Each Changes section maps 1-to-1 to a commit. Keep the one category label
correct — it is the changelog (`.github/release.yml`), and the title is the
release-note line.
