using Fallout.Common;
using Fallout.Common.IO;
using Fallout.Common.Tooling;
using Fallout.Common.Utilities;
using static Fallout.Common.Tools.Npm.NpmTasks;

namespace Fallout.Vsce;

/// <summary>
/// Locates the VS Code extension in the repository and the toolchain that builds it.
/// <para/>
/// <c>vsce</c> and <c>ovsx</c> are conventionally dev dependencies rather than global
/// installs, so the default tool paths point at <c>node_modules/.bin</c> and only fall back
/// to <c>PATH</c> when the local binary is absent.
/// </summary>
public interface IHasVsix : IFalloutBuild
{
    /// <summary>Directory holding <c>package.json</c>. Defaults to the repository root.</summary>
    AbsolutePath VsixDirectory => RootDirectory;

    /// <summary>Path of the packaged <c>.vsix</c>.</summary>
    AbsolutePath VsixFile => VsixDirectory / "fallout.vsix";

    /// <summary>Locally-installed CLI directory.</summary>
    AbsolutePath NodeModulesBinDirectory => VsixDirectory / "node_modules" / ".bin";

    /// <summary>Resolves a locally-installed npm CLI, falling back to <c>PATH</c>.</summary>
    sealed string ResolveNodeTool(string name)
    {
        // npm writes a .cmd shim next to the extensionless shell script on Windows; invoking
        // the extensionless one there starts a shell, not the tool.
        var local = NodeModulesBinDirectory / (EnvironmentInfo.IsWin ? $"{name}.cmd" : name);
        return local.FileExists() ? local.ToString() : name;
    }

    /// <summary>Path to the <c>vsce</c> CLI.</summary>
    string VsceToolPath => ResolveNodeTool(VsceTasks.PathExecutable);

    /// <summary>Path to the <c>ovsx</c> CLI.</summary>
    string OvsxToolPath => ResolveNodeTool(OvsxTasks.PathExecutable);

    /// <summary>
    /// Path to the <c>code</c> CLI. Not a node tool — it ships with the editor, so this is a
    /// plain <c>PATH</c> lookup. Override for a fork (<c>codium</c>, <c>cursor</c>) or for an
    /// install that isn't on <c>PATH</c>.
    /// </summary>
    string CodeToolPath => CodeTasks.PathExecutable;
}

/// <summary>
/// Restores, compiles, and packages a VS Code extension into a <c>.vsix</c>.
/// <para/>
/// Compilation is delegated to the project's own npm scripts rather than reimplemented — the
/// TypeScript toolchain is already described in <c>package.json</c>, and duplicating it in C#
/// would create a second source of truth that drifts.
/// </summary>
public interface IPackVsix : IHasVsix
{
    /// <summary>Version stamped into the package. Must be three integers — see <see cref="MarketplaceVersion"/>.</summary>
    string VsixVersion { get; }

    /// <summary>
    /// Marks the package as a marketplace pre-release. Independent of <see cref="VsixVersion"/>,
    /// because a marketplace version cannot itself express prerelease-ness.
    /// </summary>
    bool VsixPreRelease => false;

    /// <summary>npm script that compiles the extension.</summary>
    string CompileScript => "compile";

    /// <summary>Installs the Node toolchain from the lockfile.</summary>
    Target RestoreVsix => _ => _
        .Executes(() => Npm("ci", workingDirectory: VsixDirectory));

    /// <summary>Compiles the extension via its own npm script.</summary>
    Target CompileVsix => _ => _
        .DependsOn(RestoreVsix)
        .Executes(() => Npm($"run {CompileScript}", workingDirectory: VsixDirectory));

    /// <summary>Packages the compiled extension into a <c>.vsix</c>.</summary>
    Target PackVsix => _ => _
        .DependsOn(CompileVsix)
        .Executes(() =>
        {
            // Not .Requires(): that is for injected parameters, and VsixVersion is computed by
            // the consuming build (from Nerdbank.GitVersioning, a constant, whatever it likes).
            Assert.True(!VsixVersion.IsNullOrWhiteSpace(),
                "IPackVsix.VsixVersion resolved to nothing — the consuming build must supply a version.");

            var version = MarketplaceVersion.Normalize(VsixVersion);
            Serilog.Log.Information(
                "Packaging {File} as {Version} (pre-release: {PreRelease})", VsixFile.Name, version, VsixPreRelease);

            VsceTasks.VscePackage(_ => _
                .SetProcessToolPath(VsceToolPath)
                .SetProcessWorkingDirectory(VsixDirectory)
                .SetVersion(version)
                .SetOutput(VsixFile)
                // package.json stays the source of truth for everything but the version, which
                // the build computes; writing it back would dirty the tree on every CI run.
                .EnableNoUpdatePackageJson()
                .EnableNoGitTagVersion()
                .SetPreRelease(VsixPreRelease ? true : (bool?)null));
        });

    /// <summary>
    /// Sideloads the freshly packaged <c>.vsix</c> into the local editor — the way to dogfood a
    /// build that hasn't been published. VS Code does not auto-update a sideloaded extension,
    /// so re-run this to move to a newer build.
    /// </summary>
    Target InstallVsix => _ => _
        .DependsOn(PackVsix)
        .Executes(() =>
        {
            Serilog.Log.Information("Installing {File} into the local editor.", VsixFile.Name);
            CodeTasks.CodeInstallExtension(_ => _
                .SetProcessToolPath(CodeToolPath)
                .SetProcessWorkingDirectory(VsixDirectory)
                .SetExtension(VsixFile)
                // Without --force, installing over the same version is a no-op, which makes an
                // iterate-and-reinstall loop silently reinstall nothing.
                .EnableForce());
            Serilog.Log.Information("Installed. Reload the window (Developer: Reload Window) to pick it up.");
        });
}
