using System;
using System.Collections.Generic;
using System.Linq;
using Fallout.Common;
using Fallout.Common.Tooling;
using Fallout.Common.Utilities;
using Fallout.Common.Utilities.Collections;

namespace Fallout.Vsce;

/// <summary>
/// Fans one packaged <c>.vsix</c> out across extension registries.
/// <para/>
/// Mirrors <c>Fallout.Components.IPublish</c>: destinations are declared as data
/// (<see cref="VsixPublishTargets"/>), a CLI selector narrows them for a given run
/// (<see cref="PublishVsixTo"/>), and every selected target is validated before anything is
/// pushed — a missing credential is a configuration error knowable up front, not something to
/// discover after half the registries have already accepted the release.
/// </summary>
public interface IPublishVsix : IPackVsix
{
    /// <summary>Registries this build publishes to. Override to add or re-route destinations.</summary>
    IEnumerable<VsixPublishTarget> VsixPublishTargets => Array.Empty<VsixPublishTarget>();

    /// <summary>
    /// Names of the configured <see cref="VsixPublishTargets"/> to push to this run; empty
    /// selects all. Wire from the CLI as <c>--publish-vsix-to vs-marketplace</c>.
    /// </summary>
    [Parameter("Publish only to these named registries (default: all configured VsixPublishTargets).")]
    string[] PublishVsixTo => TryGetValue(() => PublishVsixTo) ?? Array.Empty<string>();

    /// <summary>Resolves the selector against the configured targets, asserting the result is usable.</summary>
    sealed IReadOnlyList<VsixPublishTarget> SelectedVsixPublishTargets()
    {
        var configured = VsixPublishTargets.ToList();
        var selection = PublishVsixTo;

        var targets = selection.Length == 0
            ? configured
            : configured.Where(x => selection.Contains(x.Name, StringComparer.OrdinalIgnoreCase)).ToList();

        Assert.True(targets.Count > 0,
            selection.Length == 0
                ? "No publish targets are configured — override IPublishVsix.VsixPublishTargets."
                : $"--publish-vsix-to [{selection.JoinComma()}] matched none of the configured targets [{configured.Select(x => x.Name).JoinComma()}].");

        return targets;
    }

    /// <summary>
    /// Proves each selected registry would accept a publish, without publishing. Worth running
    /// before a tag: a token that expired since the last release otherwise surfaces halfway
    /// through the real release, with some registries already updated.
    /// </summary>
    Target VerifyVsixCredentials => _ => _
        .Executes(() =>
        {
            foreach (var target in SelectedVsixPublishTargets())
            {
                Assert.True(!target.Publisher.IsNullOrWhiteSpace(),
                    $"Publish target '{target.Name}' has no Publisher — required to verify credentials.");

                Serilog.Log.Information("Verifying credentials for {Target} ({Publisher}).", target.Name, target.Publisher);

                switch (target.Registry)
                {
                    case VsixRegistry.VisualStudioMarketplace:
                        VsceTasks.VsceVerifyPat(_ => _
                            .SetProcessToolPath(VsceToolPath)
                            .SetProcessWorkingDirectory(VsixDirectory)
                            .SetPublisher(target.Publisher!)
                            .When(target.Pat is not null, _ => _.SetPat(target.Pat!)));
                        break;

                    case VsixRegistry.OpenVsx:
                        OvsxTasks.OvsxVerifyPat(_ => _
                            .SetProcessToolPath(OvsxToolPath)
                            .SetProcessWorkingDirectory(VsixDirectory)
                            .SetNamespace(target.Publisher!)
                            .When(target.Pat is not null, _ => _.SetPat(target.Pat!)));
                        break;

                    default:
                        throw new NotSupportedException($"Unknown registry '{target.Registry}'.");
                }
            }
        });

    /// <summary>Publishes the packaged <c>.vsix</c> to every selected registry.</summary>
    Target PublishVsix => _ => _
        .DependsOn(PackVsix)
        .Executes(() =>
        {
            var targets = SelectedVsixPublishTargets();
            Assert.FileExists(VsixFile);

            foreach (var target in targets)
            {
                Serilog.Log.Information("Publish target {Target}: pushing {File} → {Registry}.",
                    target.Name, VsixFile.Name, target.Registry);

                switch (target.Registry)
                {
                    case VsixRegistry.VisualStudioMarketplace:
                        VsceTasks.VscePublish(_ => _
                            .SetProcessToolPath(VsceToolPath)
                            .SetProcessWorkingDirectory(VsixDirectory)
                            .SetPackagePath(VsixFile)
                            .When(target.Pat is not null, _ => _.SetPat(target.Pat!))
                            .When(target.SkipDuplicate, _ => _.SetSkipDuplicate(true))
                            // Only an assertion against the manifest on a --packagePath publish;
                            // the bit baked in at package time is what actually decides.
                            .SetPreRelease(VsixPreRelease ? true : (bool?)null));
                        break;

                    case VsixRegistry.OpenVsx:
                        OvsxTasks.OvsxPublish(_ => _
                            .SetProcessToolPath(OvsxToolPath)
                            .SetProcessWorkingDirectory(VsixDirectory)
                            .SetExtensionFile(VsixFile)
                            .When(target.Pat is not null, _ => _.SetPat(target.Pat!))
                            .When(target.SkipDuplicate, _ => _.SetSkipDuplicate(true)));
                        break;

                    default:
                        throw new NotSupportedException($"Unknown registry '{target.Registry}'.");
                }
            }
        });
}
