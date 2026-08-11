# Changelog

## 10.4.15

Initial release, built against Fallout 10.4.0 — the release that emits
`build-graph.json` on build initialization, which everything below depends on.
The patch component is the framework's release-branch height, so the extension
version reads as 10.4.x against the Fallout 10.4 line.

- **Targets view** in the activity bar — lists build targets from `build-graph.json`, showing the default target, unlisted targets, and each target's `depends on` / `runs after` / `triggered by` / `triggers` relations as expandable children.
- **Run Target** — runs a target in an integrated `Fallout` terminal via `./build.ps1` (Windows) or `./build.sh`.
- **Go to Definition** — jumps to a target's C# declaration, using the workspace symbol provider with a regex fallback over `.cs` files.
- **Build Graph** — a Mermaid webview rendering the dependency graph; click a node to run that target.
- Live refresh: watches `build-graph.json` and updates the view and graph on change.
