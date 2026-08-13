// See VsceTasks.cs for why this wrapper is hand-written rather than generated.

using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using Fallout.Common;
using Fallout.Common.Tooling;
using Serilog.Events;

namespace Fallout.Vsce;

/// <summary>
/// The <c>code</c> CLI that ships with VS Code — used here to sideload a locally built
/// <c>.vsix</c>, which is how you dogfood a build that hasn't been published anywhere.
/// <para/>
/// Sideloading is a one-shot install, not a subscription: VS Code will not auto-update an
/// extension it did not get from a gallery. Re-run the install to move to a newer build.
/// Automatic updates require a real gallery — the marketplace pre-release channel, or a
/// self-hosted Open VSX pointed at by <c>product.json</c>'s <c>extensionsGallery</c>.
/// </summary>
// The code CLI writes Node's own diagnostics to stderr, which the default logger surfaces
// as errors and lists under "Errors & Warnings" — so a successful install reports an
// [ERR] line about url.parse() that has nothing to do with the build. Demoted rather than
// hidden: same approach NpmTasks takes to npm's notices.
[ExcludeFromCodeCoverage]
// Node's deprecation notice spans two lines — the "(Use `Code --trace-deprecation …`)"
// continuation needs demoting as well, or it survives on its own as a bare [ERR].
[LogLevelPattern(LogEventLevel.Debug, @"^\(node:\d+\)")]
[LogLevelPattern(LogEventLevel.Debug, @"^\(Use `")]
[LogLevelPattern(LogEventLevel.Warning, "^Failed to install")]
[PathTool(Executable = PathExecutable)]
public partial class CodeTasks : ToolTasks
{
    /// <summary>Executable name looked up on <c>PATH</c> when no explicit tool path is set.</summary>
    public const string PathExecutable = "code";

    /// <summary>Resolved path to the <c>code</c> executable.</summary>
    public static string CodePath
    {
        get => new CodeTasks().GetToolPathInternal();
        set => new CodeTasks().SetToolPath(value);
    }

    /// <summary>Invokes <c>code</c> with raw arguments.</summary>
    public static IReadOnlyCollection<Output> Code(
        ArgumentStringHandler arguments,
        string? workingDirectory = null,
        IReadOnlyDictionary<string, string>? environmentVariables = null,
        int? timeout = null,
        bool? logOutput = null,
        bool? logInvocation = null,
        Action<OutputType, string>? logger = null,
        Func<IProcess, object>? exitHandler = null)
        => new CodeTasks().Run(arguments, workingDirectory, environmentVariables, timeout, logOutput, logInvocation, logger, exitHandler);

    /// <summary>Installs an extension from a <c>.vsix</c> path or a marketplace id.</summary>
    public static IReadOnlyCollection<Output> CodeInstallExtension(CodeInstallExtensionSettings? options = null)
        => new CodeTasks().Run<CodeInstallExtensionSettings>(options ?? new CodeInstallExtensionSettings());

    /// <inheritdoc cref="CodeInstallExtension(CodeInstallExtensionSettings)"/>
    public static IReadOnlyCollection<Output> CodeInstallExtension(Configure<CodeInstallExtensionSettings> configurator)
        => new CodeTasks().Run<CodeInstallExtensionSettings>(configurator.Invoke(new CodeInstallExtensionSettings()));
}

#region CodeInstallExtensionSettings

/// <inheritdoc cref="CodeTasks.CodeInstallExtension(CodeInstallExtensionSettings)"/>
[ExcludeFromCodeCoverage]
[Command(Type = typeof(CodeTasks), Command = nameof(CodeTasks.CodeInstallExtension))]
public partial class CodeInstallExtensionSettings : ToolOptions
{
    /// <summary>Path to a <c>.vsix</c>, or a <c>publisher.name</c> marketplace id.</summary>
    [Argument(Format = "--install-extension {value}")] public string? Extension => Get<string>(() => Extension);

    /// <summary>Replaces an already-installed version of the same extension.</summary>
    [Argument(Format = "--force")] public bool? Force => Get<bool?>(() => Force);

    /// <summary>Install into an isolated extensions directory rather than the user's.</summary>
    [Argument(Format = "--extensions-dir {value}")] public string? ExtensionsDirectory => Get<string>(() => ExtensionsDirectory);

    /// <summary>Prefer the pre-release version when installing by marketplace id.</summary>
    [Argument(Format = "--pre-release")] public bool? PreRelease => Get<bool?>(() => PreRelease);
}

/// <inheritdoc cref="CodeInstallExtensionSettings"/>
[ExcludeFromCodeCoverage]
public static class CodeInstallExtensionSettingsExtensions
{
    /// <inheritdoc cref="CodeInstallExtensionSettings.Extension"/>
    [Builder(Type = typeof(CodeInstallExtensionSettings), Property = nameof(CodeInstallExtensionSettings.Extension))]
    public static T SetExtension<T>(this T o, string v) where T : CodeInstallExtensionSettings => o.Modify(b => b.Set(() => o.Extension, v));

    /// <inheritdoc cref="CodeInstallExtensionSettings.Force"/>
    [Builder(Type = typeof(CodeInstallExtensionSettings), Property = nameof(CodeInstallExtensionSettings.Force))]
    public static T EnableForce<T>(this T o) where T : CodeInstallExtensionSettings => o.Modify(b => b.Set(() => o.Force, true));

    /// <inheritdoc cref="CodeInstallExtensionSettings.ExtensionsDirectory"/>
    [Builder(Type = typeof(CodeInstallExtensionSettings), Property = nameof(CodeInstallExtensionSettings.ExtensionsDirectory))]
    public static T SetExtensionsDirectory<T>(this T o, string v) where T : CodeInstallExtensionSettings => o.Modify(b => b.Set(() => o.ExtensionsDirectory, v));

    /// <inheritdoc cref="CodeInstallExtensionSettings.PreRelease"/>
    [Builder(Type = typeof(CodeInstallExtensionSettings), Property = nameof(CodeInstallExtensionSettings.PreRelease))]
    public static T EnablePreRelease<T>(this T o) where T : CodeInstallExtensionSettings => o.Modify(b => b.Set(() => o.PreRelease, true));
}

#endregion
