// Hand-written tool wrapper. The in-tree Fallout tools are emitted by
// Fallout.Tooling.Generator from a <Tool>.json spec; that generator is a repo-internal
// build step, so a plugin outside the repo writes the same shape by hand. The shape is
// deliberately identical to Npm.Generated.cs: a ToolTasks subclass, [Command]-annotated
// ToolOptions per subcommand, [Argument]-annotated properties, and fluent [Builder]
// setters — so a consumer cannot tell the difference at the call site.

using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using Fallout.Common;
using Fallout.Common.Tooling;

namespace Fallout.Vsce;

/// <summary>
/// <p><a href="https://github.com/microsoft/vscode-vsce">vsce</a> — the VS Code Extension
/// manager. Packages an extension into a <c>.vsix</c> and publishes it to the Visual Studio
/// Marketplace.</p>
/// <p>Normally installed as a dev dependency rather than globally, so callers usually set
/// <see cref="ToolOptions.ProcessToolPath"/> to the local <c>node_modules/.bin</c> binary —
/// see <see cref="IHasVsix.VsceToolPath"/>.</p>
/// </summary>
[ExcludeFromCodeCoverage]
[PathTool(Executable = PathExecutable)]
public partial class VsceTasks : ToolTasks
{
    /// <summary>Executable name looked up on <c>PATH</c> when no explicit tool path is set.</summary>
    public const string PathExecutable = "vsce";

    /// <summary>Resolved path to the <c>vsce</c> executable.</summary>
    public static string VscePath
    {
        get => new VsceTasks().GetToolPathInternal();
        set => new VsceTasks().SetToolPath(value);
    }

    /// <summary>Invokes <c>vsce</c> with raw arguments.</summary>
    public static IReadOnlyCollection<Output> Vsce(
        ArgumentStringHandler arguments,
        string? workingDirectory = null,
        IReadOnlyDictionary<string, string>? environmentVariables = null,
        int? timeout = null,
        bool? logOutput = null,
        bool? logInvocation = null,
        Action<OutputType, string>? logger = null,
        Func<IProcess, object>? exitHandler = null)
        => new VsceTasks().Run(arguments, workingDirectory, environmentVariables, timeout, logOutput, logInvocation, logger, exitHandler);

    /// <summary>Packages the extension into a <c>.vsix</c>.</summary>
    public static IReadOnlyCollection<Output> VscePackage(VscePackageSettings? options = null)
        => new VsceTasks().Run<VscePackageSettings>(options ?? new VscePackageSettings());

    /// <inheritdoc cref="VscePackage(VscePackageSettings)"/>
    public static IReadOnlyCollection<Output> VscePackage(Configure<VscePackageSettings> configurator)
        => new VsceTasks().Run<VscePackageSettings>(configurator.Invoke(new VscePackageSettings()));

    /// <summary>Publishes a packaged <c>.vsix</c> to the Visual Studio Marketplace.</summary>
    public static IReadOnlyCollection<Output> VscePublish(VscePublishSettings? options = null)
        => new VsceTasks().Run<VscePublishSettings>(options ?? new VscePublishSettings());

    /// <inheritdoc cref="VscePublish(VscePublishSettings)"/>
    public static IReadOnlyCollection<Output> VscePublish(Configure<VscePublishSettings> configurator)
        => new VsceTasks().Run<VscePublishSettings>(configurator.Invoke(new VscePublishSettings()));

    /// <summary>Verifies that a PAT can publish for the given publisher, without publishing.</summary>
    public static IReadOnlyCollection<Output> VsceVerifyPat(VsceVerifyPatSettings? options = null)
        => new VsceTasks().Run<VsceVerifyPatSettings>(options ?? new VsceVerifyPatSettings());

    /// <inheritdoc cref="VsceVerifyPat(VsceVerifyPatSettings)"/>
    public static IReadOnlyCollection<Output> VsceVerifyPat(Configure<VsceVerifyPatSettings> configurator)
        => new VsceTasks().Run<VsceVerifyPatSettings>(configurator.Invoke(new VsceVerifyPatSettings()));
}

#region VscePackageSettings

/// <inheritdoc cref="VsceTasks.VscePackage(VscePackageSettings)"/>
[ExcludeFromCodeCoverage]
[Command(Type = typeof(VsceTasks), Command = nameof(VsceTasks.VscePackage), Arguments = "package")]
public partial class VscePackageSettings : ToolOptions
{
    /// <summary>
    /// Version to stamp into the package. Must be three integers — the Marketplace rejects
    /// semver prerelease versions outright, so <c>1.2.3-rc.1</c> is not packageable. Mark a
    /// release candidate with <see cref="PreRelease"/> instead.
    /// </summary>
    [Argument(Format = "{value}", Position = 1)] public string? Version => Get<string>(() => Version);

    /// <summary>Target path for the produced <c>.vsix</c>.</summary>
    [Argument(Format = "--out {value}")] public string? Output => Get<string>(() => Output);

    /// <summary>
    /// Marks the package as a pre-release, written into the VSIX manifest as
    /// <c>Microsoft.VisualStudio.Code.PreRelease</c>. This is the only way to express an RC;
    /// a version is pre-release or stable and can never be both.
    /// </summary>
    [Argument(Format = "--pre-release")] public bool? PreRelease => Get<bool?>(() => PreRelease);

    /// <summary>Leaves <c>package.json</c>'s <c>version</c> untouched when a version is supplied.</summary>
    [Argument(Format = "--no-update-package-json")] public bool? NoUpdatePackageJson => Get<bool?>(() => NoUpdatePackageJson);

    /// <summary>Suppresses the git tag npm would otherwise create for the version bump.</summary>
    [Argument(Format = "--no-git-tag-version")] public bool? NoGitTagVersion => Get<bool?>(() => NoGitTagVersion);

    /// <summary>Skips the dependency detection step.</summary>
    [Argument(Format = "--no-dependencies")] public bool? NoDependencies => Get<bool?>(() => NoDependencies);

    /// <summary>Skips the prepublish script.</summary>
    [Argument(Format = "--no-prepublish")] public bool? NoPrePublish => Get<bool?>(() => NoPrePublish);

    /// <summary>Target platform for a platform-specific package (e.g. <c>win32-x64</c>).</summary>
    [Argument(Format = "--target {value}")] public string? Target => Get<string>(() => Target);
}

/// <inheritdoc cref="VscePackageSettings"/>
[ExcludeFromCodeCoverage]
public static class VscePackageSettingsExtensions
{
    /// <inheritdoc cref="VscePackageSettings.Version"/>
    [Builder(Type = typeof(VscePackageSettings), Property = nameof(VscePackageSettings.Version))]
    public static T SetVersion<T>(this T o, string v) where T : VscePackageSettings => o.Modify(b => b.Set(() => o.Version, v));

    /// <inheritdoc cref="VscePackageSettings.Output"/>
    [Builder(Type = typeof(VscePackageSettings), Property = nameof(VscePackageSettings.Output))]
    public static T SetOutput<T>(this T o, string v) where T : VscePackageSettings => o.Modify(b => b.Set(() => o.Output, v));

    /// <inheritdoc cref="VscePackageSettings.PreRelease"/>
    [Builder(Type = typeof(VscePackageSettings), Property = nameof(VscePackageSettings.PreRelease))]
    public static T SetPreRelease<T>(this T o, bool? v) where T : VscePackageSettings => o.Modify(b => b.Set(() => o.PreRelease, v));

    /// <inheritdoc cref="VscePackageSettings.PreRelease"/>
    [Builder(Type = typeof(VscePackageSettings), Property = nameof(VscePackageSettings.PreRelease))]
    public static T EnablePreRelease<T>(this T o) where T : VscePackageSettings => o.Modify(b => b.Set(() => o.PreRelease, true));

    /// <inheritdoc cref="VscePackageSettings.NoUpdatePackageJson"/>
    [Builder(Type = typeof(VscePackageSettings), Property = nameof(VscePackageSettings.NoUpdatePackageJson))]
    public static T EnableNoUpdatePackageJson<T>(this T o) where T : VscePackageSettings => o.Modify(b => b.Set(() => o.NoUpdatePackageJson, true));

    /// <inheritdoc cref="VscePackageSettings.NoGitTagVersion"/>
    [Builder(Type = typeof(VscePackageSettings), Property = nameof(VscePackageSettings.NoGitTagVersion))]
    public static T EnableNoGitTagVersion<T>(this T o) where T : VscePackageSettings => o.Modify(b => b.Set(() => o.NoGitTagVersion, true));

    /// <inheritdoc cref="VscePackageSettings.NoDependencies"/>
    [Builder(Type = typeof(VscePackageSettings), Property = nameof(VscePackageSettings.NoDependencies))]
    public static T EnableNoDependencies<T>(this T o) where T : VscePackageSettings => o.Modify(b => b.Set(() => o.NoDependencies, true));

    /// <inheritdoc cref="VscePackageSettings.Target"/>
    [Builder(Type = typeof(VscePackageSettings), Property = nameof(VscePackageSettings.Target))]
    public static T SetTarget<T>(this T o, string v) where T : VscePackageSettings => o.Modify(b => b.Set(() => o.Target, v));
}

#endregion

#region VscePublishSettings

/// <inheritdoc cref="VsceTasks.VscePublish(VscePublishSettings)"/>
[ExcludeFromCodeCoverage]
[Command(Type = typeof(VsceTasks), Command = nameof(VsceTasks.VscePublish), Arguments = "publish")]
public partial class VscePublishSettings : ToolOptions
{
    /// <summary>Path to an already-packaged <c>.vsix</c> to publish.</summary>
    [Argument(Format = "--packagePath {value}")] public string? PackagePath => Get<string>(() => PackagePath);

    /// <summary>Azure DevOps PAT with Marketplace &gt; Manage scope. Also readable from <c>VSCE_PAT</c>.</summary>
    [Argument(Format = "--pat {value}", Secret = true)] public string? Pat => Get<string>(() => Pat);

    /// <summary>
    /// Asserts the package was built as a pre-release. On a <see cref="PackagePath"/> publish this
    /// only validates against the VSIX manifest — the manifest bit set at package time is what
    /// actually determines pre-release status.
    /// </summary>
    [Argument(Format = "--pre-release")] public bool? PreRelease => Get<bool?>(() => PreRelease);

    /// <summary>Succeeds instead of failing when the version is already published.</summary>
    [Argument(Format = "--skip-duplicate")] public bool? SkipDuplicate => Get<bool?>(() => SkipDuplicate);

    /// <summary>Target platform for a platform-specific publish.</summary>
    [Argument(Format = "--target {value}")] public string? Target => Get<string>(() => Target);
}

/// <inheritdoc cref="VscePublishSettings"/>
[ExcludeFromCodeCoverage]
public static class VscePublishSettingsExtensions
{
    /// <inheritdoc cref="VscePublishSettings.PackagePath"/>
    [Builder(Type = typeof(VscePublishSettings), Property = nameof(VscePublishSettings.PackagePath))]
    public static T SetPackagePath<T>(this T o, string v) where T : VscePublishSettings => o.Modify(b => b.Set(() => o.PackagePath, v));

    /// <inheritdoc cref="VscePublishSettings.Pat"/>
    [Builder(Type = typeof(VscePublishSettings), Property = nameof(VscePublishSettings.Pat))]
    public static T SetPat<T>(this T o, string v) where T : VscePublishSettings => o.Modify(b => b.Set(() => o.Pat, v));

    /// <inheritdoc cref="VscePublishSettings.PreRelease"/>
    [Builder(Type = typeof(VscePublishSettings), Property = nameof(VscePublishSettings.PreRelease))]
    public static T SetPreRelease<T>(this T o, bool? v) where T : VscePublishSettings => o.Modify(b => b.Set(() => o.PreRelease, v));

    /// <inheritdoc cref="VscePublishSettings.SkipDuplicate"/>
    [Builder(Type = typeof(VscePublishSettings), Property = nameof(VscePublishSettings.SkipDuplicate))]
    public static T SetSkipDuplicate<T>(this T o, bool? v) where T : VscePublishSettings => o.Modify(b => b.Set(() => o.SkipDuplicate, v));
}

#endregion

#region VsceVerifyPatSettings

/// <inheritdoc cref="VsceTasks.VsceVerifyPat(VsceVerifyPatSettings)"/>
[ExcludeFromCodeCoverage]
[Command(Type = typeof(VsceTasks), Command = nameof(VsceTasks.VsceVerifyPat), Arguments = "verify-pat")]
public partial class VsceVerifyPatSettings : ToolOptions
{
    /// <summary>Publisher the PAT is checked against.</summary>
    [Argument(Format = "{value}", Position = 1)] public string? Publisher => Get<string>(() => Publisher);

    /// <summary>Azure DevOps PAT. Also readable from <c>VSCE_PAT</c>.</summary>
    [Argument(Format = "--pat {value}", Secret = true)] public string? Pat => Get<string>(() => Pat);
}

/// <inheritdoc cref="VsceVerifyPatSettings"/>
[ExcludeFromCodeCoverage]
public static class VsceVerifyPatSettingsExtensions
{
    /// <inheritdoc cref="VsceVerifyPatSettings.Publisher"/>
    [Builder(Type = typeof(VsceVerifyPatSettings), Property = nameof(VsceVerifyPatSettings.Publisher))]
    public static T SetPublisher<T>(this T o, string v) where T : VsceVerifyPatSettings => o.Modify(b => b.Set(() => o.Publisher, v));

    /// <inheritdoc cref="VsceVerifyPatSettings.Pat"/>
    [Builder(Type = typeof(VsceVerifyPatSettings), Property = nameof(VsceVerifyPatSettings.Pat))]
    public static T SetPat<T>(this T o, string v) where T : VsceVerifyPatSettings => o.Modify(b => b.Set(() => o.Pat, v));
}

#endregion
