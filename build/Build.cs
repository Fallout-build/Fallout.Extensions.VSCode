using System.Collections.Generic;
using System.Reflection;
using Fallout.Common;
using Fallout.Common.Tools.NerdbankGitVersioning;
using Fallout.Vsce;

// Dogfood: the extension's own build/publish pipeline is a Fallout build, and the vsce/ovsx
// toolchain it drives is a Fallout plugin (plugins/Fallout.Vsce) rather than anything baked
// into the framework. Fallout as a general orchestrator, not just a .NET build tool.
//
//   dotnet fallout PackVsix                  -> produces fallout.vsix
//   dotnet fallout VerifyVsixCredentials     -> proves the tokens work, publishes nothing
//   dotnet fallout PublishVsix               -> publishes to every configured registry
//   dotnet fallout PublishVsix --publish-vsix-to open-vsx   -> just that one
//
// Registry tokens are read from the environment by the CLIs themselves (VSCE_PAT / OVSX_PAT);
// this build never handles them, so they stay out of process argument lists and logs.
partial class Build : FalloutBuild, IPublishVsix
{
    public static int Main() => Execute<Build>(x => ((IPackVsix)x).PackVsix);

    /// <summary>Publisher on the VS Marketplace and namespace on Open VSX.</summary>
    const string Publisher = "fallout";

    /// <summary>
    /// Marks this build's package as a marketplace pre-release. Kept independent of the
    /// version because a marketplace version cannot express prerelease-ness: a release
    /// candidate is a plain triple plus a manifest bit. Set by the rc path in CI.
    /// </summary>
    [Parameter("Mark the packaged extension as a marketplace pre-release")]
    readonly bool PreRelease;

    // Versioning matches the framework's own: Nerdbank.GitVersioning over version.json.
    [NerdbankGitVersioning] readonly NerdbankGitVersioning Versioning;

    bool IPackVsix.VsixPreRelease => PreRelease;

    string IPackVsix.VsixVersion
    {
        get
        {
            var (version, _) = MarketplaceVersion.FromNerdbankGitVersioning(Versioning, PreRelease);
            AssertFrameworkLineMatches(version);
            return version;
        }
    }

    IEnumerable<VsixPublishTarget> IPublishVsix.VsixPublishTargets =>
    [
        new VsixPublishTarget
        {
            Name = "vs-marketplace",
            Registry = VsixRegistry.VisualStudioMarketplace,
            Publisher = Publisher
        },
        new VsixPublishTarget
        {
            Name = "open-vsx",
            Registry = VsixRegistry.OpenVsx,
            Publisher = Publisher
        }
    ];

    /// <summary>
    /// The extension's major.minor are a promise about which Fallout release line it targets —
    /// README documents it, and model.ts warns the user at runtime when the workspace's
    /// framework drifts from it. version.json states that line; the pinned Fallout.Common
    /// package is what the extension was actually built against. Nothing keeps the two in step
    /// automatically, so bumping one and forgetting the other would ship a version that lies.
    /// </summary>
    void AssertFrameworkLineMatches(string version)
    {
        var info = typeof(FalloutBuild).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion ?? "0.0.0";

        var framework = MarketplaceVersion.Normalize(info);

        var declared = version.Split('.');
        var actual = framework.Split('.');

        Assert.True(declared[0] == actual[0] && declared[1] == actual[1],
            $"Version line mismatch: version.json declares {declared[0]}.{declared[1]}.x but the build "
            + $"references Fallout {framework}. Update version.json's \"version\" and the pinned "
            + "Fallout.Common together, or the published extension misstates which framework it targets.");
    }
}
