// See VsceTasks.cs for why this wrapper is hand-written rather than generated.

using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using Fallout.Common;
using Fallout.Common.Tooling;

namespace Fallout.Vsce;

/// <summary>
/// <p><a href="https://github.com/eclipse/openvsx">ovsx</a> — the Open VSX registry CLI, the
/// vendor-neutral marketplace used by VS Code forks (VSCodium, Gitpod, Cursor).</p>
/// <p>Publishing a prepackaged <c>.vsix</c> reads the pre-release bit from the VSIX manifest;
/// <c>--pre-release</c> is ignored in that mode, so package it correctly rather than relying
/// on the publish flag.</p>
/// </summary>
[ExcludeFromCodeCoverage]
[PathTool(Executable = PathExecutable)]
public partial class OvsxTasks : ToolTasks
{
    /// <summary>Executable name looked up on <c>PATH</c> when no explicit tool path is set.</summary>
    public const string PathExecutable = "ovsx";

    /// <summary>Resolved path to the <c>ovsx</c> executable.</summary>
    public static string OvsxPath
    {
        get => new OvsxTasks().GetToolPathInternal();
        set => new OvsxTasks().SetToolPath(value);
    }

    /// <summary>Invokes <c>ovsx</c> with raw arguments.</summary>
    public static IReadOnlyCollection<Output> Ovsx(
        ArgumentStringHandler arguments,
        string? workingDirectory = null,
        IReadOnlyDictionary<string, string>? environmentVariables = null,
        int? timeout = null,
        bool? logOutput = null,
        bool? logInvocation = null,
        Action<OutputType, string>? logger = null,
        Func<IProcess, object>? exitHandler = null)
        => new OvsxTasks().Run(arguments, workingDirectory, environmentVariables, timeout, logOutput, logInvocation, logger, exitHandler);

    /// <summary>Publishes a packaged <c>.vsix</c> to Open VSX.</summary>
    public static IReadOnlyCollection<Output> OvsxPublish(OvsxPublishSettings? options = null)
        => new OvsxTasks().Run<OvsxPublishSettings>(options ?? new OvsxPublishSettings());

    /// <inheritdoc cref="OvsxPublish(OvsxPublishSettings)"/>
    public static IReadOnlyCollection<Output> OvsxPublish(Configure<OvsxPublishSettings> configurator)
        => new OvsxTasks().Run<OvsxPublishSettings>(configurator.Invoke(new OvsxPublishSettings()));

    /// <summary>Verifies a PAT against a namespace, without publishing.</summary>
    public static IReadOnlyCollection<Output> OvsxVerifyPat(OvsxVerifyPatSettings? options = null)
        => new OvsxTasks().Run<OvsxVerifyPatSettings>(options ?? new OvsxVerifyPatSettings());

    /// <inheritdoc cref="OvsxVerifyPat(OvsxVerifyPatSettings)"/>
    public static IReadOnlyCollection<Output> OvsxVerifyPat(Configure<OvsxVerifyPatSettings> configurator)
        => new OvsxTasks().Run<OvsxVerifyPatSettings>(configurator.Invoke(new OvsxVerifyPatSettings()));
}

#region OvsxPublishSettings

/// <inheritdoc cref="OvsxTasks.OvsxPublish(OvsxPublishSettings)"/>
[ExcludeFromCodeCoverage]
[Command(Type = typeof(OvsxTasks), Command = nameof(OvsxTasks.OvsxPublish), Arguments = "publish")]
public partial class OvsxPublishSettings : ToolOptions
{
    /// <summary>Path to the <c>.vsix</c> to publish (positional).</summary>
    [Argument(Format = "{value}", Position = 1)] public string? ExtensionFile => Get<string>(() => ExtensionFile);

    /// <summary>Open VSX access token. Also readable from <c>OVSX_PAT</c>.</summary>
    [Argument(Format = "--pat {value}", Secret = true)] public string? Pat => Get<string>(() => Pat);

    /// <summary>Succeeds instead of failing when the version is already published.</summary>
    [Argument(Format = "--skip-duplicate")] public bool? SkipDuplicate => Get<bool?>(() => SkipDuplicate);

    /// <summary>Registry URL, for self-hosted Open VSX instances.</summary>
    [Argument(Format = "--registryUrl {value}")] public string? RegistryUrl => Get<string>(() => RegistryUrl);

    /// <summary>Target platform for a platform-specific publish.</summary>
    [Argument(Format = "--target {value}")] public string? Target => Get<string>(() => Target);
}

/// <inheritdoc cref="OvsxPublishSettings"/>
[ExcludeFromCodeCoverage]
public static class OvsxPublishSettingsExtensions
{
    /// <inheritdoc cref="OvsxPublishSettings.ExtensionFile"/>
    [Builder(Type = typeof(OvsxPublishSettings), Property = nameof(OvsxPublishSettings.ExtensionFile))]
    public static T SetExtensionFile<T>(this T o, string v) where T : OvsxPublishSettings => o.Modify(b => b.Set(() => o.ExtensionFile, v));

    /// <inheritdoc cref="OvsxPublishSettings.Pat"/>
    [Builder(Type = typeof(OvsxPublishSettings), Property = nameof(OvsxPublishSettings.Pat))]
    public static T SetPat<T>(this T o, string v) where T : OvsxPublishSettings => o.Modify(b => b.Set(() => o.Pat, v));

    /// <inheritdoc cref="OvsxPublishSettings.SkipDuplicate"/>
    [Builder(Type = typeof(OvsxPublishSettings), Property = nameof(OvsxPublishSettings.SkipDuplicate))]
    public static T SetSkipDuplicate<T>(this T o, bool? v) where T : OvsxPublishSettings => o.Modify(b => b.Set(() => o.SkipDuplicate, v));

    /// <inheritdoc cref="OvsxPublishSettings.RegistryUrl"/>
    [Builder(Type = typeof(OvsxPublishSettings), Property = nameof(OvsxPublishSettings.RegistryUrl))]
    public static T SetRegistryUrl<T>(this T o, string v) where T : OvsxPublishSettings => o.Modify(b => b.Set(() => o.RegistryUrl, v));
}

#endregion

#region OvsxVerifyPatSettings

/// <inheritdoc cref="OvsxTasks.OvsxVerifyPat(OvsxVerifyPatSettings)"/>
[ExcludeFromCodeCoverage]
[Command(Type = typeof(OvsxTasks), Command = nameof(OvsxTasks.OvsxVerifyPat), Arguments = "verify-pat")]
public partial class OvsxVerifyPatSettings : ToolOptions
{
    /// <summary>Namespace the token is checked against.</summary>
    [Argument(Format = "{value}", Position = 1)] public string? Namespace => Get<string>(() => Namespace);

    /// <summary>Open VSX access token. Also readable from <c>OVSX_PAT</c>.</summary>
    [Argument(Format = "--pat {value}", Secret = true)] public string? Pat => Get<string>(() => Pat);
}

/// <inheritdoc cref="OvsxVerifyPatSettings"/>
[ExcludeFromCodeCoverage]
public static class OvsxVerifyPatSettingsExtensions
{
    /// <inheritdoc cref="OvsxVerifyPatSettings.Namespace"/>
    [Builder(Type = typeof(OvsxVerifyPatSettings), Property = nameof(OvsxVerifyPatSettings.Namespace))]
    public static T SetNamespace<T>(this T o, string v) where T : OvsxVerifyPatSettings => o.Modify(b => b.Set(() => o.Namespace, v));

    /// <inheritdoc cref="OvsxVerifyPatSettings.Pat"/>
    [Builder(Type = typeof(OvsxVerifyPatSettings), Property = nameof(OvsxVerifyPatSettings.Pat))]
    public static T SetPat<T>(this T o, string v) where T : OvsxVerifyPatSettings => o.Modify(b => b.Set(() => o.Pat, v));
}

#endregion
