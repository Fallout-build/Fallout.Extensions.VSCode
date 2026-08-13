# Fallout.Vsce

A [Fallout](https://github.com/Fallout-build/Fallout) plugin for the VS Code extension toolchain: `vsce` (Visual Studio Marketplace) and `ovsx` (Open VSX).

Deliberately **not** in the Fallout repo. [ADR-0001](https://github.com/Fallout-build/Fallout/blob/main/docs/adr/0001-cd-primitives-attributes-vs-tasks.md) proposes shipping provider integrations as plugins on the framework rather than in-tree components, with Octopus as the first candidate; this is the smaller sibling that proves the shape first. Nothing here needed an escape hatch into framework internals — the same public primitives that in-tree components use were enough.

## What's in it

**Tool wrappers** — `VsceTasks`, `OvsxTasks`. The framework's in-tree tools are emitted by `Fallout.Tooling.Generator` from a `<Tool>.json` spec, which is a repo-internal build step; a plugin writes the same shape by hand. `ToolTasks` subclass, `[Command]`-annotated `ToolOptions` per subcommand, `[Argument]` properties, fluent `[Builder]` setters — indistinguishable at the call site:

```csharp
VsceTasks.VscePackage(_ => _
    .SetVersion("10.4.16")
    .SetOutput(VsixFile)
    .EnablePreRelease());
```

**Components** — `IHasVsix`, `IPackVsix`, `IPublishVsix`, mirroring `Fallout.Components`' `IRestore` / `IPack` / `IPublish`. Registries are declared as data and narrowed per run, exactly as `IPublish` does for NuGet feeds:

```csharp
class Build : FalloutBuild, IPublishVsix
{
    string IPackVsix.VsixVersion => /* however you version */;

    IEnumerable<VsixPublishTarget> IPublishVsix.VsixPublishTargets =>
    [
        new() { Name = "vs-marketplace", Registry = VsixRegistry.VisualStudioMarketplace, Publisher = "you" },
        new() { Name = "open-vsx",       Registry = VsixRegistry.OpenVsx,                 Publisher = "you" }
    ];
}
```

```bash
dotnet fallout PackVsix
dotnet fallout InstallVsix                        # sideload into the local editor
dotnet fallout VerifyVsixCredentials              # proves the tokens, publishes nothing
dotnet fallout PublishVsix
dotnet fallout PublishVsix --publish-vsix-to open-vsx
```

**`CodeTasks`** wraps the `code` CLI that ships with the editor, which is what `InstallVsix` uses to sideload a build that hasn't been published. Point `IHasVsix.CodeToolPath` at `codium` or `cursor` for a fork.

**`MarketplaceVersion`** — the one rule neither the versioning tool nor the registries will enforce for you: three integers, no prerelease. `vsce` throws on `10.4.16-rc.1`, and Nerdbank.GitVersioning stamps stable builds with four components, so both cases get normalised here.

## Things worth knowing

- **A version is pre-release or stable, never both.** The bit lives in the VSIX manifest (`Microsoft.VisualStudio.Code.PreRelease`) and is set at *package* time. Publishing `1.2.3` as a pre-release burns that number for good.
- **`ovsx` ignores `--pre-release` for a prepackaged `.vsix`** — it reads the manifest. Package it correctly; don't rely on the publish flag.
- **`vsce publish --pre-release` on a `--packagePath` is only an assertion** against the package, not what sets the status.
- **Tool resolution** prefers `node_modules/.bin` over `PATH` for `vsce`/`ovsx`, since both are conventionally dev dependencies. `code` is a plain `PATH` lookup — it ships with the editor. Override via `IHasVsix.VsceToolPath` / `OvsxToolPath` / `CodeToolPath`.
- **A sideloaded extension never auto-updates.** VS Code only tracks versions for extensions it got from a gallery, so `InstallVsix` is a one-shot install — re-run it to move to a newer build.
- **Tokens** are left to the CLIs' own environment variables (`VSCE_PAT`, `OVSX_PAT`) unless you set `VsixPublishTarget.Pat`, so they stay out of process argument lists.

## Status

Consumed as a `ProjectReference` while the surface settles; packable, so extracting it to its own repo and feed is a build-file change rather than a rewrite.
