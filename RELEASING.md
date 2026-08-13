# Releasing

Maintainer reference. Mirrors the Fallout repo's [branching-and-release](https://github.com/Fallout-build/Fallout/blob/main/docs/branching-and-release.md) model, adapted to extension marketplaces.

## Versioning

[Nerdbank.GitVersioning](https://github.com/dotnet/Nerdbank.GitVersioning) computes the version from `version.json`, as in the framework repo.

- `version.json`'s `version` pins the **Fallout release line** this extension targets (`10.4`). The third component is the git height and moves on its own.
- The build asserts the declared line still matches the referenced `Fallout.Common`. Bumping one without the other fails the build rather than shipping a version that misstates its target.
- `versionHeightOffset` exists because height restarts when `version.json` is introduced or its `version` changes. Marketplace versions must increase monotonically, so the offset keeps the sequence moving forward.

Check what will be produced:

```bash
dotnet nbgv get-version
```

### Why release candidates aren't `-rc.N`

Both registries take **exactly three integers**. `vsce` refuses a semver prerelease outright:

> The VS Marketplace doesn't support prerelease versions

So an RC is an ordinary triple carrying a pre-release bit in the VSIX manifest (`Microsoft.VisualStudio.Code.PreRelease`), and the `-rc.N` suffix lives only on the git tag and the GitHub release.

The consequence that shapes the whole pipeline: **a version is pre-release or stable, never both.** Publishing `10.4.16` as a marketplace pre-release would burn that number, forcing GA to `10.4.17`. Release candidates therefore never reach a marketplace — they stop at GitHub, and the number stays free.

## Channels

GitHub is the pre-stage; each marketplace is a promotion target with its own environment.

| Channel | Trigger | Gating |
|---|---|---|
| `preview` (rolling) | every push to `main` | none |
| `github-releases` | any release tag | none |
| `vs-marketplace` | `workflow_dispatch` opt-in flag | flag + approval |
| `open-vsx` | `workflow_dispatch` opt-in flag | flag + approval |

A tag push **never** reaches a marketplace. Promotion is deliberate: set the flag, then approve the environment — two independent layers, matching how Fallout gates nuget.org.

## The preview channel

Every push to `main` builds a `.vsix` and replaces the asset on a rolling `preview` GitHub pre-release (`preview.yml`). It's the counterpart to the framework's per-commit `-preview` packages — reshaped because GitHub Packages doesn't speak the VS Code gallery protocol and neither marketplace accepts a semver prerelease.

The `preview` tag deliberately doesn't match `v*`, so it neither triggers `publish.yml` nor falls under the `v*` tag-protection ruleset — which matters, because the workflow force-moves it on every push.

### Installing a preview

```bash
gh release download preview -R Fallout-build/Fallout.Extensions.VSCode -p '*.vsix' --clobber
code --install-extension fallout.vsix --force
```

The download URL is stable, so that pair of commands is the whole update story — no run IDs to hunt, no expiry. Each run also uploads the same `.vsix` as a workflow artifact, which is the fixed record of what a given commit produced; the rolling asset can't be, since the next push replaces it.

Building locally, `dotnet fallout PackVsix` produces the `.vsix` and you install it the same way. Installing is deliberately a manual step — the build never touches your editor.

### Why this isn't auto-updating

VS Code will not auto-update a manually installed extension — it only tracks versions for extensions it got from a gallery, and this channel has no gallery. Manual download-and-install is the deliberate trade-off; the build never touches your editor.

Two ways to get real automatic updates, if that ever becomes worth the cost:

- **Marketplace pre-release channel.** The native mechanism: VS Code offers *"Switch to Pre-Release Version"* and updates it like anything else. Requires an actual marketplace presence. Note the version-burning concern doesn't apply to a preview stream — the patch is a git height, so every build has a unique number and stable is always a later height.
- **A self-hosted gallery at `gallery.fallout.build`** — tracked as [#6](https://github.com/Fallout-build/Fallout.Extensions.VSCode/issues/6), with the hosting options and their trade-offs in [Chrison-Homelab/Homelab#409](https://github.com/Chrison-Homelab/Homelab/issues/409). Since registries are already modelled as data in `IPublishVsix`, adding one is a target entry rather than a new pipeline.

## Cutting a release candidate

```bash
git switch main && git pull --ff-only
dotnet nbgv get-version          # the number this release will carry
gh release create v10.4.16-rc.1 --target main --prerelease --generate-notes
```

The tag must match the version `nbgv` computes for that commit — the workflow packages from the checked-out tag, not from the tag name, so a mismatch ships a `.vsix` whose version disagrees with its release.

The tag push builds the `.vsix` with the pre-release bit set and attaches it to a GitHub pre-release. Install it with **Extensions: Install from VSIX…** to dogfood.

## Cutting a stable release

```bash
gh release create v10.4.16 --target main --generate-notes
```

That publishes to GitHub Releases only. To then promote to the marketplaces:

```bash
gh workflow run publish.yml -f tag=v10.4.16 -f publish-to-marketplaces=true
```

Both `vs-marketplace` and `open-vsx` pause for approval on the run page (*Review deployments*). Approve each. The job publishes the exact artifact the `pack` job produced (`--skip PackVsix`), not a rebuild.

You can rehearse the wiring without burning a release: set the flag, wait for the approval prompt, then cancel without approving.

## If a publish fails partway

Both CLIs are invoked with `--skip-duplicate`, so re-running is idempotent on whatever already landed:

```bash
gh workflow run publish.yml -f tag=v10.4.16 -f publish-to-marketplaces=true
```

## Release notes

Generated by GitHub from merged PR labels — the taxonomy lives in [`.github/release.yml`](.github/release.yml) and matches the Fallout repo's. Apply one category label per PR (`enhancement`, `bug`, `breaking-change`, `security`, `documentation`, `dependencies`), or `skip-changelog` for housekeeping.

There is no `CHANGELOG.md`. The labels are the changelog — a hand-maintained file would duplicate them, and its version heading could not be written correctly in advance since the patch is a git height. If the marketplace page ever needs a rendered changelog, it should be **generated into the `.vsix` at pack time** from these notes, not reinstated as a tracked file.

## Tokens

| Secret | Used by | Scope |
|---|---|---|
| `VSCE_PAT` | `vs-marketplace` | Azure DevOps PAT, Marketplace > Manage |
| `OVSX_TOKEN` | `open-vsx` | Open VSX access token (mapped to `OVSX_PAT`) |

Both are read from the environment by the CLIs, never passed as process arguments. Verify them without publishing:

```bash
dotnet fallout VerifyVsixCredentials
```
