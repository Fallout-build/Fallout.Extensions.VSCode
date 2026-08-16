# Fallout for VS Code

Explore, run, and visualize your [Fallout](https://github.com/Fallout-build/Fallout) (the NUKE successor) build targets without leaving the editor.

## Features

- **Targets view** — a dedicated Fallout container in the activity bar lists every build target, with the default target and each target's relations (`depends on`, `runs after`, `triggered by`, `triggers`) as expandable children.
- **Run a target** — inline ▶ on any target runs it in an integrated terminal (`./build.ps1` on Windows, `./build.sh` elsewhere).
- **Go to definition** — jump straight to the `Target X => ...` C# declaration; disambiguated by declaring type when several components declare the same name.
- **Build graph** — a Mermaid diagram of the whole dependency graph; click a node to run that target.
- Auto-refreshes as the build graph changes.

## Requirements

**Fallout 10.4.0 or later.** The extension reads a `build-graph.json` that the Fallout build writes into `.fallout/temp/` (or the legacy `.nuke/temp/`) on every build initialization — the emission landed in 10.4.0, so older framework versions produce no graph at all. Run the build once (e.g. `./build.ps1 --plan`) to generate it.

## Versioning

The extension's `major.minor` track the Fallout framework release line it targets — 10.4.x builds against Fallout 10.4 — while the patch moves independently. A mismatch between the extension and the framework your workspace builds with surfaces as a non-blocking warning.

Versions are computed by [Nerdbank.GitVersioning](https://github.com/dotnet/Nerdbank.GitVersioning) from `version.json`, the same as the framework itself; the build fails if the declared line drifts from the Fallout version it actually references. Release candidates are published as GitHub pre-releases only.

## Contributing

This repository uses GitFlow: branch from `develop`, PR back into `develop`. See [docs/branching-and-release.md](docs/branching-and-release.md), [docs/ci.md](docs/ci.md) and [docs/releasing.md](docs/releasing.md).

[AGENTS.md](AGENTS.md) is the canonical brief on how this repo is built and released — conventions, the generated-CI rule, the versioning contract. It serves human contributors and AI tools alike; GitHub Copilot reads it natively and `CLAUDE.md` points to it.

## License

[MIT](LICENSE)
