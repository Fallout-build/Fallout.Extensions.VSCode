# Issue & PR writing style

How issues and pull-request descriptions are written in this repo — by humans and AI tools alike. Condensed from the framework repo's [`docs/agents/issue-and-pr-style.md`](https://github.com/Fallout-build/Fallout/blob/main/docs/agents/issue-and-pr-style.md); the two should stay compatible, so contributors meet one convention across both.

The GitHub issue forms (`.github/ISSUE_TEMPLATE/*.yml`) define the canonical *shape* for humans. This doc defines the *style*, and is what AI tools are bound to — a `.yml` form doesn't constrain an agent running `gh issue create`.

Goal: **terse, scannable.** A busy maintainer should get the point on the first screen, on a phone, without scrolling.

## Principles

- **Lead with the ask in one line.** First sentence = what and why. Everything else is support.
- **Match length to substance.** A one-line fix gets a one-line description. There is no minimum length to hit.
- **Cut filler.** No preamble, no restating the title, no hedging, no marketing tone ("elegant", "robust", "seamlessly"), no emoji section headers.
- **Write for non-native English readers.** Plain words over idiom, short sentences, no slang.
- **Bullets over prose** for anything enumerable.
- **Link, don't recap.** Reference issues (`#123`), PRs, docs, and code (`src/model.ts:64`) instead of pasting them.
- **Describe outcomes, not your process.** What changed and why it matters — not the journey.
- **Cut what the reader can get elsewhere.** If the diff or a linked issue already carries it, reference and summarize. Keep only what the reader *can't* get without you. Best single test for whether a line earns its place.
- **It's probably just an issue.** Don't reach for RFC or ADR framing by default.

## Issue shape

```markdown
### Problem
<1–2 sentences: what's wrong or missing, and for whom>

### Outcome
<observable "done" — behaviour, not implementation>

### Acceptance criteria
- [ ] <testable>
- [ ] <testable>
```

Drop `Acceptance criteria` (and add a short `### Notes`) when it doesn't fit the ask. Don't invent criteria — leave `- [ ]` stubs if unknown.

For bug reports, the form's fields replace this shape. Always include the three versions that make a report actionable here: **VS Code, extension, and Fallout**. The extension is only useful against **Fallout 10.4.0+**, and a large share of "the view is empty" reports are an older framework emitting no `build-graph.json` at all.

## PR descriptions

Lead with a one-line summary, then short "what changed" bullets. Link the issue and summarize it — don't recite it.

**The PR title is the release note.** Release notes are generated from merged PR titles grouped by label ([`.github/release.yml`](../.github/release.yml)), so write the title as the line you'd want to read in the changelog. There is no `CHANGELOG.md` to update.

- **Functional titles, no conventional-commit prefixes.** Not `feat:`/`fix:`/`chore:`. Good: "Jump to the declaring type when several components declare a target".
- **One category label**: `enhancement`, `bug`, `breaking-change`, `security`, `documentation`, `dependencies` — or `skip-changelog` for housekeeping.
- **Breaking change** here means removing or renaming a command ID, setting, or view ID; dropping support for a VS Code or Fallout version; or changing the `build-graph.json` contract. Label it and add a `⚠️ Breaking change` callout.
- Say how you verified. There is no test suite, so "compiles" is not verification — name what you ran in the Extension Development Host.

## Commit messages

- Functional imperative phrases; no conventional-commit prefixes.
- Subject completes "This commit will…" without saying so.
- Body, when needed, explains *why* rather than *what*. Skip file and type names — the diff has them.
