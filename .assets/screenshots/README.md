# Screenshots

Marketplace and README imagery. Kept here rather than in `media/` because `media/`
ships inside the `.vsix` (the extension icon lives there) and these do not —
`.assets/**` is `.vscodeignore`d.

README image links must be **absolute** `raw.githubusercontent.com` URLs pinned to
`develop`. `vsce` rewrites relative links when it packages, and the rewritten base
is not guaranteed to match this repo's default branch.

## Shot list

Capture in an Extension Development Host (<kbd>F5</kbd>) with this repository open as
the workspace — it builds with Fallout, so the graph is already populated. Use the
**dark** theme to match the banner, and hide any personal paths.

| File | What to show |
|---|---|
| `build-view.png` | Fallout container, Build view, one target expanded to show `depends on` / `triggers` children. The default target's rocket icon visible. |
| `run-config.png` | Run Configuration view with two or three parameters filled and one secret listed as *not set*. |
| `build-graph.png` | The Mermaid graph panel, whole graph visible, showing solid / dashed / thick edges. |
| `explorer-dock.png` | The Explorer with the **Fallout Build** section expanded, alongside the file tree. |

Crop to the panel plus a little context rather than a full desktop. Aim for roughly
1000–1400px wide; a 2× retina capture scaled down reads best on the marketplace.
