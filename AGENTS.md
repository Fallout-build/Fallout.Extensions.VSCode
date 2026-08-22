# AGENTS.md

Guidance for AI coding tools (Claude Code, GitHub Copilot, Cursor, Aider, Codex, etc.) working in this repo.

This is the **canonical brief**. GitHub Copilot reads this `AGENTS.md` natively; the `CLAUDE.md` tool-specific file points here. Same convention as the [framework repo](https://github.com/Fallout-build/Fallout/blob/main/AGENTS.md).

## What this project is

The **VS Code extension for [Fallout](https://github.com/Fallout-build/Fallout)** (the NUKE successor): a Targets tree view in the activity bar, run-a-target in an integrated terminal, go-to-definition on the C# `Target X => ...` declaration, and a Mermaid build graph. It reads a `build-graph.json` that the Fallout build emits into `.fallout/temp/` (or legacy `.nuke/temp/`) on every build initialization — emission landed in **Fallout 10.4.0**, so older framework versions produce no graph at all.

The repo holds three things, and they are easy to confuse:

| Directory | What it is |
|---|---|
| `src/` | The shipped extension (TypeScript). |
| `plugins/Fallout.Vsce/` | A packable **Fallout plugin** wrapping the `vsce`/`ovsx` CLIs. Shipped code — intended for other repos to consume, and code-owned accordingly. |
| `build/` | The Fallout build orchestrator (C#) that packs and publishes the extension. Scaffold, not shipped. |

**This repo is dogfooding.** The extension's own build/publish pipeline is a Fallout build, and the toolchain it drives is a Fallout *plugin* rather than anything baked into the framework — Fallout as a general orchestrator, not just a .NET build tool. `Fallout.Vsce` is deliberately **not** in the framework repo: it's the pilot for [ADR-0001](https://github.com/Fallout-build/Fallout/blob/main/docs/adr/0001-cd-primitives-attributes-vs-tasks.md)'s "provider integrations ship as plugins" shape, and it proved out using only public primitives — no escape hatch into framework internals.

**Versioning.** The extension's `major.minor` track the Fallout release line it targets (`10.4.x` against Fallout 10.4); the patch is a git height and moves independently. [Nerdbank.GitVersioning](https://github.com/dotnet/Nerdbank.GitVersioning) computes it from `version.json`, same as the framework. See [docs/releasing.md](docs/releasing.md#versioning).

**Branching: GitFlow** — `develop` is the trunk and default branch, `main` is production. This differs from the framework repo, which has no `develop` and uses permanent `release/YYYY` production lines. See [docs/branching-and-release.md](docs/branching-and-release.md).

## Stack

- **Extension:** TypeScript 5.9 → `tsc` → `out/`. `strict: true`, CommonJS, ES2022. VS Code engine `^1.85.0`. One runtime dependency: `mermaid`.
- **Build:** .NET SDK pinned in `global.json` (`10.0.100`, `rollForward: latestMinor`); Fallout 10.4.0 as the `fallout.globaltool` (`.config/dotnet-tools.json`) and the `Fallout.Common` package reference.
- `nuget.config` clears sources and pins nuget.org only, so a machine-level feed can't shadow the pinned Fallout packages.
- **There is no test suite** — no test runner, no `npm test`, no `.vscode-test` harness. Verification is `tsc` plus running the extension (F5) or sideloading the packed `.vsix`. Don't invent a test command; if you add a framework, that's a deliberate decision to raise.

## Common commands

```bash
./build.sh                    # default target: PackVsix (./build.ps1 on Windows)
./build.sh PackVsix           # what the PR gate runs -> fallout.vsix
./build.sh --plan             # what would run, without running it
./build.sh --help             # list all targets and parameters

dotnet fallout VerifyVsixCredentials                    # proves marketplace tokens, publishes nothing
dotnet fallout PublishVsix --publish-vsix-to open-vsx   # one registry instead of all
dotnet nbgv get-version                                 # the version this commit would ship as

npm run compile               # tsc only (the build calls this via IPackVsix.CompileVsix)
npm run watch
```

To restructure an existing PR's commit history into focused commits, use the `/restructure-pr-commits` skill — but check its step 0 first: PRs into `develop` are **squashed**, so curating their commits is wasted effort. To draft an issue, use `/new-issue` or the `story-writer` agent.

`build.sh`/`build.ps1` provision the .NET SDK, run `dotnet tool restore`, then hand off to `dotnet fallout`. The `RestoreVsix → CompileVsix → PackVsix` chain lives in [`plugins/Fallout.Vsce/IPackVsix.cs`](plugins/Fallout.Vsce/IPackVsix.cs), **not** in `build/Build.cs` — `Build.cs` only supplies the version, the pre-release bit, and the registry list.

Compilation is delegated to the project's own npm scripts rather than reimplemented in C#: `package.json` already describes the TypeScript toolchain, and duplicating it would create a second source of truth.

## Critical rules (read this every session)

1. **`.github/workflows/build.yml` is generated — never hand-edit it.** It comes from the `[GitHubActions]` attribute in [`build/Build.CI.GitHubActions.cs`](build/Build.CI.GitHubActions.cs); edit the attribute and run `./build.sh` to regenerate. The file carries an `<auto-generated>` header saying so. `publish.yml` and `nightly.yml` are hand-written on purpose ([docs/ci.md](docs/ci.md#publishyml)).
2. **`build.yml` and `build-skip.yml` must stay exact complements.** `build.yml` excludes `**/*.md`; `build-skip.yml` fires on exactly that path set, does nothing, and reports success under the same **job** name `ubuntu-latest` — which *is* the required status-check context. A gap between the two path sets leaves a PR blocked forever on a check that never arrives. This is why the exclude is one flat pattern with no negations or carve-outs. Keep the job name, path sets, and branch lists in lockstep across both files.
3. **`version.json` and the pinned `Fallout.Common` move together.** `Build.AssertFrameworkLineMatches` fails the build if the declared line (`10.4`) drifts from the referenced framework version in `build/_build.csproj` *and* `plugins/Fallout.Vsce/Fallout.Vsce.csproj`. Bumping one and forgetting the other would ship a version that lies about what it targets. Never lower `versionHeightOffset` — it keeps marketplace versions monotonic across `version.json` changes.
4. **Marketplace versions are three integers, no prerelease.** `vsce` rejects `10.4.30-rc.1` outright ("The VS Marketplace doesn't support prerelease versions"). A release candidate is a plain triple carrying a pre-release *bit* in the VSIX manifest (`Microsoft.VisualStudio.Code.PreRelease`), set at **package** time; `-rc.N` lives only on the git tag and GitHub release. **A version is pre-release or stable, never both** — publishing `10.4.30` as a pre-release burns that number, so RCs stop at GitHub. `MarketplaceVersion` normalises all of this.
5. **`package.json`'s `"version": "0.0.0"` is intentional.** The build stamps the real version via `vsce package --no-update-package-json`, so CI never dirties the tree. `package.json` stays the source of truth for everything *except* the version.
6. **`.vscodeignore` ships exactly one file out of `node_modules`** — `mermaid/dist/mermaid.min.js`, loaded by the graph webview as a classic `<script>`. Adding a runtime dependency means adding it there too, or it won't be in the `.vsix`.
7. **Tokens stay in the environment.** `VSCE_PAT` / `OVSX_PAT` are read by the CLIs themselves — never pass them as process arguments, where they'd land in argument lists and logs.
8. **One category label per PR** (`enhancement`, `bug`, `breaking-change`, `security`, `documentation`, `dependencies`) or `skip-changelog`. The labels **are** the changelog — there is deliberately no `CHANGELOG.md` ([docs/releasing.md](docs/releasing.md#release-notes)). Branch from `develop`, PR back to `develop`; pass `--base` explicitly when you mean `main` or a support line. Write issues and PR descriptions terse, per [docs/issue-and-pr-style.md](docs/issue-and-pr-style.md) — lead with the point, bullets over prose, link don't recap. Issues use the **Problem → Outcome → Acceptance criteria** shape.
9. **Merge method is per-direction, and it's discipline not configuration.** Merge commits are disabled and linear history is enforced everywhere, so: **squash** into `develop` (working branches accumulate WIP), **rebase** into `main` (squashing collapses a whole release into one commit and loses per-change history on the production branch). GitHub can't enforce this per branch.
10. **Every release channel is tag-triggered** — an accidental `v*` tag is an accidental release. Tag pushes are covered by a repository ruleset for non-admins. A tag push never reaches a marketplace on its own; promotion needs an explicit dispatch flag *plus* environment approval.

## Extension architecture

- **[`src/model.ts`](src/model.ts)** — the logic layer, near-free of UI: graph discovery (`findGraphFile` probes `.fallout/temp` then `.nuke/temp` across workspace folders), parsing, `checkCompatibility`, and `toMermaid`. The schema `version` is a **hard gate**; the extension-vs-framework `major.minor` comparison is a **soft warning**, deduplicated via a module-level `warned` set.
- **[`src/extension.ts`](src/extension.ts)** — tree data provider plus command registration. Relations (`dependsOn`, `after`, `triggeredBy`, `triggers`) render as recursively expandable children. A `**/build-graph.json` watcher refreshes both tree and panel; parse failures during refresh are swallowed deliberately, because the build may be mid-write and the next watcher event re-reads it.
- **[`src/goToTarget.ts`](src/goToTarget.ts)** — C# workspace symbol provider first (precise, needs Roslyn warmed up), regex scan over `**/*.cs` as fallback. `declaredIn` from the graph disambiguates same-named targets declared across component interfaces.
- **[`src/graphPanel.ts`](src/graphPanel.ts)** — singleton webview, CSP-locked with a nonce, `localResourceRoots` scoped to Mermaid's `dist`. Talks to the page via `ready` / `graph` / `run` messages.

Mermaid edge semantics **match the framework's `--plan` HTML** — solid = execution dependency, dashed = order dependency, thick = trigger; arrows point prerequisite → dependent. Keep them in step if the framework's rendering changes.

`emitting triggers alone avoids duplicate edges`: `triggeredBy` is the same relation seen from the other side.

## Where to look next

- **[docs/branching-and-release.md](docs/branching-and-release.md)** — the GitFlow model, branch table, protection matrix, merge-method rationale, when to cut a `support/vX.Y` line
- **[docs/ci.md](docs/ci.md)** — what each workflow does, why `build-skip.yml` exists, why `publish.yml` is hand-written, CI gotchas (`PublicRelease`, `fetch-depth: 0`, string-typed boolean inputs)
- **[docs/releasing.md](docs/releasing.md)** — versioning, the four channels, and a runbook per release kind (simple, stabilised, RC, hotfix, support line, marketplace promotion)
- **[docs/issue-and-pr-style.md](docs/issue-and-pr-style.md)** — how to write terse issues, stories, PR descriptions, and commit messages
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — contributor-facing flow, and the "things that will fail review" list
- **[plugins/Fallout.Vsce/README.md](plugins/Fallout.Vsce/README.md)** — the plugin's own brief: component shapes, tool-resolution order, and the `vsce`/`ovsx` pre-release quirks
- **[README.md](README.md)** — the marketplace-facing page (the marketplace renders this and only this; `docs/**` is `.vscodeignore`d)

## Useful pointers

- **`build/Build.cs` is small on purpose.** Reusable target logic belongs in the plugin's components (`IHasVsix` / `IPackVsix` / `IPublishVsix`), which mirror `Fallout.Components`' `IRestore` / `IPack` / `IPublish` — registries declared as data, narrowed per run by a CLI selector, validated up front.
- **`ovsx` ignores `--pre-release` for a prepackaged `.vsix`** (it reads the manifest), and `vsce publish --pre-release` on a `--packagePath` is only an *assertion* against the package. The bit set at package time is what decides.
- **Tool resolution prefers `node_modules/.bin` over `PATH`**, since both CLIs are conventionally dev dependencies. On Windows it must pick the `.cmd` shim — invoking the extensionless script there starts a shell, not the tool.
- **Installing is out of scope by design.** The build packages and publishes; it never touches your editor. A manually installed `.vsix` doesn't auto-update anyway — VS Code only tracks versions for extensions it obtained from a gallery (see [#6](https://github.com/Fallout-build/Fallout.Extensions.VSCode/issues/6)).
- **Code owners are scoped to shipped code only** (`/src/**`, `/plugins/**`), mirroring the framework repo. Build, CI, docs and root config are gated by the status check alone — which is why routine build/CI work lands without a second reviewer.
