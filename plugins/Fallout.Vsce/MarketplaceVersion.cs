using System;
using System.Linq;
using Fallout.Common.Tools.NerdbankGitVersioning;

namespace Fallout.Vsce;

/// <summary>
/// Maps a semantic version onto what the extension marketplaces actually accept.
/// <para/>
/// Both registries take <b>exactly three integers</b> and nothing else. vsce refuses a
/// semver prerelease outright — <c>semver.prerelease(manifest.version)</c> throws
/// <i>"The VS Marketplace doesn't support prerelease versions"</i> — so <c>10.4.16-rc.1</c>
/// can never be published. A release candidate is therefore an ordinary triple carrying a
/// pre-release bit in the VSIX manifest, and the <c>-rc.N</c> suffix lives only on the git
/// tag and the GitHub release.
/// <para/>
/// The consequence worth knowing before you publish: a given version is pre-release
/// <i>or</i> stable and can never be both. Publishing <c>10.4.16</c> as a pre-release burns
/// that number — the stable release then has to be <c>10.4.17</c>. This is why the release
/// pipeline keeps release candidates on GitHub and off the marketplaces entirely.
/// </summary>
public static class MarketplaceVersion
{
    /// <summary>
    /// Derives the marketplace version from Nerdbank.GitVersioning, matching how the Fallout
    /// framework itself versions. <paramref name="preRelease"/> forces the pre-release bit on
    /// independently of the computed version — an extension RC is a decision about this
    /// release, not a property of the version string, precisely because the version string
    /// cannot carry it.
    /// </summary>
    public static (string Version, bool PreRelease) FromNerdbankGitVersioning(
        NerdbankGitVersioning versioning,
        bool preRelease = false)
    {
        if (versioning is null)
            throw new ArgumentNullException(nameof(versioning));

        var source = !string.IsNullOrWhiteSpace(versioning.SimpleVersion)
            ? versioning.SimpleVersion
            : versioning.Version;

        return (Normalize(source),
            preRelease || !string.IsNullOrEmpty(versioning.PrereleaseVersion));
    }

    /// <summary>
    /// Reduces any version string to the three-integer form the marketplaces accept.
    /// <para/>
    /// Nerdbank.GitVersioning stamps stable builds with four components
    /// (<c>10.4.0.15</c>), which is not valid semver and fails marketplace validation, so the
    /// fourth is dropped. Prerelease and build-metadata suffixes are stripped for the same
    /// reason. Missing components are zero-filled: <c>10.4</c> becomes <c>10.4.0</c>.
    /// </summary>
    public static string Normalize(string version)
    {
        if (string.IsNullOrWhiteSpace(version))
            throw new ArgumentException("Version must not be empty.", nameof(version));

        // Strip build metadata (+g<sha>) then any prerelease tag (-rc.1).
        var core = version.Split('+')[0].Split('-')[0];

        var parts = core
            .Split('.')
            .TakeWhile(x => int.TryParse(x, out _))
            .Take(3)
            .ToArray();

        if (parts.Length == 0)
            throw new ArgumentException($"Cannot derive a marketplace version from '{version}'.", nameof(version));

        return string.Join(".", Enumerable.Range(0, 3).Select(i => parts.ElementAtOrDefault(i) ?? "0"));
    }
}
