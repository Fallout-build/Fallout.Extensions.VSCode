# Developing

Running the extension from source, on a machine that has never built it.

## Prerequisites

Node 20+ and the .NET SDK pinned in [`global.json`](../global.json). Nothing else — `build.ps1` / `build.sh` provision the Fallout CLI themselves, and `npm ci` installs `vsce`/`ovsx` locally rather than globally.

```bash
npm ci
```

## The loop

**Press F5.** That compiles, then opens a second VS Code window — the Extension Development Host — with the extension loaded from `out/`. Two configurations are provided:

| Configuration | Use when |
|---|---|
| **Run Extension** | Normal work. |
| **Run Extension (clean profile)** | Something looks wrong and you need to rule out interference from your own installed extensions (`--disable-extensions`). |

Both open **this repo** as the test workspace, which is the point: the repo builds with Fallout, so it already has a `.fallout/temp/build-graph.json` and the views populate immediately. Change the last entry in `args` to test against a different build.

After editing, either restart the debug session, or run the `npm: watch` task and use **Developer: Reload Window** in the host — faster, and it keeps the workspace state (parameters and secrets you entered) intact.

### Without VS Code's launcher

Equivalent to F5, for a terminal or a machine driving it headlessly:

```bash
npm run compile
code --extensionDevelopmentPath="$PWD" --new-window "$PWD"
```

## If a view is empty

The extension reads a build graph the Fallout build emits. No graph, no targets:

```bash
./build.ps1 --plan        # writes .fallout/temp/build-graph.json without running anything
```

Requires Fallout 10.4.0 or later — the emission landed in that release, so older framework versions produce no graph at all.

The **Deployment** view is expected to stay empty. It is a declared placeholder: the continuous-delivery model (channels → environments → targets, ADR-0009) is emitted by the framework, and nothing writes a `deployment-graph.json` yet.

## Packaging

The `.vsix` is built by the Fallout build, not by an npm script — the version is computed, so packaging is a build concern:

```bash
./build.ps1 PackVsix                    # produces fallout.vsix
./build.ps1 PackVsix --pre-release      # marks it a marketplace pre-release
```

`package.json`'s `version` is `0.0.0` on purpose. The real version comes from Nerdbank.GitVersioning at pack time; a number hardcoded beside it would be a second source of truth guaranteed to drift. See [releasing.md](releasing.md).

Install the result with **Extensions: Install from VSIX…** to test it as a user would, rather than as a development host.

## See also

- [ci.md](ci.md) — what runs in CI, and running those same targets locally
- [branching-and-release.md](branching-and-release.md) — GitFlow, protection, merge rules
- [releasing.md](releasing.md) — versioning, channels, cutting a release
- [../plugins/Fallout.Vsce/README.md](../plugins/Fallout.Vsce/README.md) — the vsce/ovsx toolchain plugin the build drives
