# Screenshots

README and marketplace imagery. Kept here rather than in `media/` because `media/`
ships inside the `.vsix` (the extension icon lives there) and these do not —
`.assets/**` is `.vscodeignore`d.

README links these with **absolute** `raw.githubusercontent.com` URLs pinned to
`develop`. Verified: `vsce` passes absolute URLs through unchanged, while it
rewrites relative ones to a base that is not guaranteed to match this repo's
default branch.

| File | Used for |
|---|---|
| `overview.png` | Hero. Explorer file tree, the Fallout Build dock, and the graph in one frame. |
| `targets-and-source.png` | Build view — the `DependsOn` chain in the tree beside the C# that declares it. |
| `run-configuration.png` | Run Configuration — a parameter and a secret, with the keychain note visible. |

## Still wanted

- **A target actually running in the integrated terminal.** The obvious shot for
  "Run a target", and the one thing the current set does not show. Run a *real*
  target — `./build.sh PackVsix`. An earlier attempt used `./build.sh flowchart`,
  which is not a target in this build; the Fallout banner prints before target
  resolution, so the failure is just below the fold and easy to miss.

## Capturing

Extension Development Host (<kbd>F5</kbd>) with this repository open — it builds with
Fallout, so the graph is already populated. Dark theme, to match the banner. Crop to
the panel plus a little context; roughly 1000–1400px wide reads best, and a 2× retina
capture scaled down is sharpest.
