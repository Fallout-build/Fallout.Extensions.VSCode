using System.Linq;
using System.Reflection;
using Fallout.Common;
using Fallout.Common.IO;
using static Fallout.Common.Tools.Npm.NpmTasks;

// Dogfood: the extension's own build/publish pipeline is a Fallout build. It drives the
// Node toolchain (npm scripts wrapping tsc / vsce / ovsx) rather than reimplementing it —
// Fallout as a general orchestrator, not just a .NET build tool.
//
//   dotnet fallout Pack       -> produces fallout.vsix
//   dotnet fallout Publish    -> publishes to VS Marketplace + Open VSX
//
// Marketplace tokens are read from the environment by vsce (VSCE_PAT) and ovsx (OVSX_PAT);
// this build never handles them directly.
class Build : FalloutBuild
{
    public static int Main() => Execute<Build>(x => x.Pack);

    // Marks the packaged extension as a marketplace pre-release. The VS Marketplace rejects
    // semver prerelease versions outright — `vsce` throws on `10.4.15-rc.1` — so a release
    // candidate is an ordinary three-integer version carrying a pre-release bit in the VSIX
    // manifest (Microsoft.VisualStudio.Code.PreRelease), set at package time.
    //
    // Deliberately independent of the framework's own version state: the extension needs to
    // be able to cut an RC while the Fallout it targets is already GA.
    [Parameter("Mark the packaged extension as a marketplace pre-release")]
    readonly bool PreRelease;

    Target Restore => _ => _
        .Executes(() =>
        {
            Npm("ci", workingDirectory: RootDirectory);
        });

    Target Compile => _ => _
        .DependsOn(Restore)
        .Executes(() =>
        {
            Npm("run compile", workingDirectory: RootDirectory);
        });

    Target Pack => _ => _
        .DependsOn(Compile)
        .Executes(() =>
        {
            var (version, frameworkPreRelease) = FrameworkVersion();
            // Either an explicitly requested RC, or a build against a not-yet-GA framework.
            var preRelease = PreRelease || frameworkPreRelease;
            Serilog.Log.Information("Packaging extension as {Version} (pre-release: {PreRelease})", version, preRelease);
            Npm(
                $"run package -- {version} --no-update-package-json --no-git-tag-version"
                + (preRelease ? " --pre-release" : ""),
                workingDirectory: RootDirectory);
        });

    Target PublishMarketplace => _ => _
        .DependsOn(Pack)
        .Executes(() =>
        {
            Npm("run publish:vsce", workingDirectory: RootDirectory);
        });

    Target PublishOpenVsx => _ => _
        .DependsOn(Pack)
        .Executes(() =>
        {
            Npm("run publish:ovsx", workingDirectory: RootDirectory);
        });

    Target Publish => _ => _
        .DependsOn(PublishMarketplace, PublishOpenVsx);

    // The extension version tracks the Fallout framework it was built against — the pinned
    // Fallout.Common package, read back from the loaded assembly. Marketplaces accept only
    // three integers, so major.minor come from the framework release line and the third is
    // whatever counter moves within it:
    //
    //   10.4.0.15+f16e0f1441  -> 10.4.15  (stable)      third = the git height
    //   10.4.0-rc.5           -> 10.4.5   (pre-release)  third = the prerelease counter
    //
    // Nerdbank.GitVersioning stamps stable builds with a four-component version, so the
    // height has to be picked out explicitly — returning the release verbatim would emit
    // 10.4.0.15, which is not valid semver and fails marketplace validation.
    static (string Version, bool PreRelease) FrameworkVersion()
    {
        var info = typeof(FalloutBuild).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion ?? "0.0.0";

        var core = info.Split('+')[0];
        var dash = core.IndexOf('-');
        var preRelease = dash >= 0;

        var parts = (preRelease ? core[..dash] : core).Split('.');
        var major = parts.ElementAtOrDefault(0) ?? "0";
        var minor = parts.ElementAtOrDefault(1) ?? "0";
        var height = (preRelease
            ? core[(dash + 1)..].Split('.').FirstOrDefault(p => int.TryParse(p, out _))
            : parts.ElementAtOrDefault(3)) ?? "0";

        return ($"{major}.{minor}.{height}", preRelease);
    }
}
