using Fallout.Common.CI.GitHubActions;
using Fallout.Vsce;

// The PR gate is GENERATED from the attribute below — edit here and regenerate
// (`./build.ps1`), never hand-edit `.github/workflows/build.yml`.
//
// Node is not installed by the generated workflow: the [GitHubActions] generator emits
// checkout / cache / setup-dotnet and nothing else, with no hook for extra steps. The
// gate therefore runs on the Node preinstalled on ubuntu-latest, which is current enough
// for `npm ci` + `tsc` + `vsce`. That is fine for a gate and not fine for a release,
// which is the first of two reasons publish.yml is hand-written.
//
// The second is shape: publish.yml fans out into per-channel jobs bound to GitHub
// Environments with approval gates, passing one artifact between them. The attribute
// generator emits a single job per image and has no notion of any of that.
//
// This mirrors how the framework repo splits it — Fallout generates build.yml /
// build-cross-platform.yml and hand-writes publish-packages-preview.yml /
// publish-packages-release.yml, for the same category of reason (see
// Fallout's build/Build.CI.GitHubActions.cs).
//
// What matters either way: the *build* is defined in C#. Both workflows only provision
// toolchains and route channels — every step that does something is a Fallout target.
[GitHubActions(
    "build",
    GitHubActionsImage.UbuntuLatest,
    FetchDepth = 0,                                    // Nerdbank.GitVersioning needs full history
    ConcurrencyGroup = "${{ github.workflow }}-${{ github.ref }}",
    ConcurrencyCancelInProgress = true,
    CheckoutRef = "${{ github.head_ref }}",
    OnPullRequestBranches = [MainBranch],
    OnPullRequestExcludePaths = ["**/*.md", ".github/**", "!.github/workflows/**"],
    InvokedTargets = [nameof(IPackVsix.PackVsix)],
    PublishArtifacts = false)]
partial class Build
{
    const string MainBranch = "main";
}
