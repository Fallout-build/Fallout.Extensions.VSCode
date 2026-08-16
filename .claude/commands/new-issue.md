---
description: Draft (and optionally file) a terse, outcome-focused GitHub issue to the repo's canonical shape.
argument-hint: <one-line description of the problem/ask>
allowed-tools: Read, Bash(gh issue create:*), Bash(gh label list:*)
---

Read `docs/issue-and-pr-style.md` and follow it as the binding style contract.
Then draft a GitHub issue for: **$ARGUMENTS**

Assemble the body to the canonical shape:

```markdown
### Problem
<1–2 sentences>

### Outcome
<observable "done">

### Acceptance criteria
- [ ] <testable>
- [ ] <testable>
```

Rules:

- Terse. Lead with the point. No preamble, no restating the title, no filler.
- Drop `Acceptance criteria` (and add a short `### Notes`) only if it doesn't
  fit the ask. Don't invent criteria — leave `- [ ]` stubs if unknown.
- Prefer links (`#123`, `src/model.ts:64`) over pasted blocks.
- For a bug, include the three versions that make a report actionable here:
  VS Code, extension, and Fallout. Most "the view is empty" reports are a
  pre-10.4.0 framework emitting no `build-graph.json` at all — rule that out
  before writing it up as an extension bug.

Show me the drafted title and body first. **Do not file it until I confirm.**
On confirmation, run `gh issue create --title "…" --body "…"` with exactly one
category label (`enhancement`, `bug`, `breaking-change`, `security`,
`documentation`, `dependencies`) — the taxonomy in `.github/release.yml`. This
repo has no `target/YYYY` labels; that is a framework-repo convention. Report
only the resulting issue URL.
