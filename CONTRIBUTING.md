# Contribution Guidelines

Contributions are welcome. As a community, we want to help each other, provide constructive feedback, and make a better product. The [Fallout code of conduct](https://github.com/Fallout-build/Fallout/blob/main/CODE_OF_CONDUCT.md) applies here too.

> **About this repo.** This is the VS Code extension for [Fallout](https://github.com/Fallout-build/Fallout), not the framework itself. It reads a `build-graph.json` the Fallout build emits, and it ships to the VS Marketplace and Open VSX. Framework changes belong in [Fallout-build/Fallout](https://github.com/Fallout-build/Fallout).

## Where to start

- Discuss non-trivial changes in an [issue](https://github.com/Fallout-build/Fallout.Extensions.VSCode/issues) first.
- Small fixes (typos, broken links) can go straight to a PR.
- **Branch from, and PR against, `develop`.** This repo uses GitFlow: `develop` is the integration trunk and the default branch, `main` is production and receives only release and hotfix merges. The only time you target `main` directly is a maintainer-driven release or hotfix. Full model in [docs/branching-and-release.md](docs/branching-and-release.md).
- Read [AGENTS.md](AGENTS.md) before you start. It is the canonical brief on how this repo is built and released — the generated-CI rule, the versioning contract, the marketplace-version constraints. It serves human contributors and AI tools alike; GitHub Copilot reads it natively and `CLAUDE.md` points to it.

## Issues

### Before creating an issue

- Search existing and closed issues first.
- Check which Fallout version your workspace builds with. The extension requires **Fallout 10.4.0 or later** — the `build-graph.json` emission landed there, so older framework versions produce no graph at all and the view stays empty.
- Confirm the graph exists: `.fallout/temp/build-graph.json` (or legacy `.nuke/temp/`). Run `./build.ps1 --plan` once to generate it.

### When creating an issue

- State the issue as concisely as possible.
- Include your VS Code version, extension version, and Fallout version.
- Use [markdown](https://docs.github.com/en/get-started/writing-on-github) for code and logs. Paste text, not screenshots of text.
- For rendering or graph-shape problems, attach the relevant slice of `build-graph.json`.

## Pull requests

### Before opening a PR

- Branch from `develop`. Name it `feature/<slug>`, `bugfix/<slug>`, `chore/<slug>`, or `docs/<slug>`.
- Make sure your employer allows the contribution.
- Build it the way CI does: `./build.sh PackVsix` (or `./build.ps1 PackVsix` on Windows). The bootstrappers are thin — they provision .NET if needed, run `dotnet tool restore`, then `dotnet fallout "$@"`. The `fallout.globaltool` version is pinned in `.config/dotnet-tools.json`.
- **There is no test suite** — no test runner, no `npm test`, no `.vscode-test` harness. Verification is `tsc` clean plus actually running the extension: F5 in VS Code for an Extension Development Host, or sideload the packed `.vsix`. Say in the PR how you verified. Introducing a test framework is a deliberate decision — raise it as an issue first rather than bundling it into an unrelated PR.

### When writing the PR

- **Write functional commit and PR titles** — describe what the change accomplishes, not how it's categorised. No conventional-commit prefixes (`feat:`, `fix:`, `chore:`, `refactor:`). Good: "Jump to the declaring type when several components declare a target", "Fix the graph panel losing its scroll position on refresh". Write the title as the line you'd want to read in the release notes, because that is exactly where it goes.
- **Apply one category label**: `enhancement`, `bug`, `breaking-change`, `security`, `documentation`, or `dependencies` — or `skip-changelog` for housekeeping. **The labels are the changelog.** There is deliberately no `CHANGELOG.md`: it would duplicate the labels, and its version heading can't be written in advance since the patch is a git height not settled until the release is cut. Taxonomy in [`.github/release.yml`](.github/release.yml).
- **Breaking change** here means removing or renaming a command ID, setting, or view ID; dropping support for a VS Code or Fallout version; or changing the `build-graph.json` contract. Label it and say so plainly in the description.
- Keep issues and PR descriptions terse — lead with the point, bullets over prose, link rather than recap. Rules in [docs/issue-and-pr-style.md](docs/issue-and-pr-style.md), kept compatible with the [framework repo's](https://github.com/Fallout-build/Fallout/blob/main/docs/agents/issue-and-pr-style.md).
- Match the surrounding style. Both codebases are comment-dense where a decision is non-obvious, and silent where the code speaks for itself.

### Things that will fail review

- **Hand-editing `.github/workflows/build.yml`.** It is generated from the `[GitHubActions]` attribute in [`build/Build.CI.GitHubActions.cs`](build/Build.CI.GitHubActions.cs); edit the attribute and run `./build.sh` to regenerate. The file carries an `<auto-generated>` header saying so.
- **Changing `build.yml`'s path filters without changing `build-skip.yml` to match.** The two must remain exact complements, reporting the same job name (`ubuntu-latest`, which *is* the required status-check context). A gap between them leaves a PR blocked forever on a check that never fires. See [docs/ci.md](docs/ci.md#build-skipyml-and-the-trap-it-exists-for).
- **Bumping `version.json` without the pinned `Fallout.Common`, or vice versa.** The build asserts the declared release line matches the framework it actually references, and fails rather than shipping a version that misstates what it targets.
- **Setting a real version in `package.json`.** `"version": "0.0.0"` is intentional — the build stamps the version at pack time with `--no-update-package-json` so CI never dirties the tree.
- **Adding a runtime dependency without updating [`.vscodeignore`](.vscodeignore).** It ships exactly one file out of `node_modules`; anything else you add won't be in the `.vsix`.

### After opening a PR

- The required check is **`ubuntu-latest`** — that's the job name, not the workflow name, because branch protection keys on jobs. A docs-only PR hits the no-op shim workflow that reports the same status name.
- `/src/**` and `/plugins/**` require a code-owner review. Build, CI, docs, and root config are gated by the status check alone — which is why routine build/CI work lands without a second reviewer.
- Address review feedback in additional commits rather than force-pushing; it's easier to review.

### Merging

Merge commits are disabled and linear history is enforced on every protected branch, so **the method depends on the direction**:

| Merging | Method | Why |
|---|---|---|
| `feature/*` → `develop` | **Squash** | Working branches accumulate WIP. One commit per landed change keeps the trunk readable. |
| `develop` / `release/*` / `hotfix/*` → `main` | **Rebase** | Squashing would collapse an entire release into a single commit on the production branch, losing per-change history — and the individual commits are what get cherry-picked back to `develop`. |
| anything → `develop` (port-back) | **Squash** | It's a working branch like any other. |

GitHub can't enforce a method per branch, so this is discipline rather than configuration. Both buttons stay enabled because both are correct somewhere. Reasoning, and why rebasing across two long-lived branches is safe here, in [docs/branching-and-release.md](docs/branching-and-release.md#merging).

## Releases

Maintainer-driven; contributors don't usually need any of this.

Every push to `develop` publishes a rolling `preview` pre-release you can install from. Stable releases fire from a `v*` tag on `main` (or a `support/vX.Y` line), and **a tag push never reaches a marketplace** — promotion needs an explicit dispatch flag *plus* an environment approval. The extension's `major.minor` track the Fallout release line it targets; the patch is a git height.

- [docs/releasing.md](docs/releasing.md) — versioning, the four channels, and a runbook per release kind
- [docs/ci.md](docs/ci.md) — what each workflow does and why `publish.yml` is hand-written
- [docs/branching-and-release.md](docs/branching-and-release.md) — the branch model and protection rules
