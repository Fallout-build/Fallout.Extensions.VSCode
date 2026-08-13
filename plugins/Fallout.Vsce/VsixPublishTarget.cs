namespace Fallout.Vsce;

/// <summary>Which CLI, and therefore which registry, a <see cref="VsixPublishTarget"/> publishes through.</summary>
public enum VsixRegistry
{
    /// <summary>The Visual Studio Marketplace, via <c>vsce</c>.</summary>
    VisualStudioMarketplace,

    /// <summary>The Open VSX registry, via <c>ovsx</c>.</summary>
    OpenVsx
}

/// <summary>
/// A routable publish destination for a packaged <c>.vsix</c> — deliberately the same shape as
/// <c>Fallout.Components.PublishTarget</c>, so fanning one <c>Pack</c> across several registries
/// reads the same whether the artifact is a <c>.nupkg</c> or a <c>.vsix</c>.
/// </summary>
public sealed class VsixPublishTarget
{
    /// <summary>Logical name, used by the <c>--publish-vsix-to</c> selector (e.g. <c>vs-marketplace</c>).</summary>
    public required string Name { get; init; }

    /// <summary>Registry this target publishes to, which selects the CLI used.</summary>
    public required VsixRegistry Registry { get; init; }

    /// <summary>
    /// Access token. Both CLIs also read one from the environment (<c>VSCE_PAT</c> / <c>OVSX_PAT</c>);
    /// leaving this null falls back to that, which is what CI normally wants so the token never
    /// passes through a process argument list.
    /// </summary>
    public string? Pat { get; init; }

    /// <summary>
    /// Publisher (VS Marketplace) or namespace (Open VSX) this target owns. Used by the
    /// credential check; not needed for the publish itself.
    /// </summary>
    public string? Publisher { get; init; }

    /// <summary>Pass <c>--skip-duplicate</c> so re-running a partially-failed publish is idempotent.</summary>
    public bool SkipDuplicate { get; init; } = true;
}
