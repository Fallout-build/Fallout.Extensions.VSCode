using System.Collections.Generic;
using System.Linq;
using Fallout.Common;
using Fallout.Common.Tooling;
using Fallout.Common.Utilities;
using static Fallout.Common.Tools.Npm.NpmTasks;

namespace Fallout.Vsce;

/// <summary>
/// Runs a VS Code extension's test suites through its own npm scripts.
/// <para/>
/// As with compilation, the suites stay described in <c>package.json</c>; this component only
/// decides which scripts the build runs, and in what environment. Each script compiles what it
/// needs, so the only prerequisite is the restored toolchain.
/// </summary>
public interface ITestVsix : IPackVsix
{
    /// <summary>
    /// npm scripts to run, in order. Defaults to the suites that need nothing beyond Node and a
    /// browser: unit, webview, extension-host, and the contract check against the graph this
    /// very build has just emitted.
    /// </summary>
    IReadOnlyCollection<string> VsixTestScripts =>
        ["test:unit", "test:webview", "test:integration", "test:contract:check"];

    /// <summary>
    /// Scripts that launch a real VS Code and so need a display. On Linux without one, they run
    /// under <c>xvfb-run</c>; elsewhere they run as is.
    /// </summary>
    IReadOnlyCollection<string> VsixDisplayScripts => ["test:integration"];

    /// <summary>Runs every script in <see cref="VsixTestScripts"/>, stopping at the first failure.</summary>
    Target TestVsix => _ => _
        .DependsOn(RestoreVsix)
        .Executes(() =>
        {
            foreach (var script in VsixTestScripts)
            {
                Serilog.Log.Information("Running npm script {Script}", script);
                if (VsixDisplayScripts.Contains(script)
                    && EnvironmentInfo.IsLinux
                    && EnvironmentInfo.GetVariable("DISPLAY").IsNullOrEmpty())
                {
                    ProcessTasks.StartProcess("xvfb-run", $"-a npm run {script}", VsixDirectory)
                        .AssertZeroExitCode();
                }
                else
                {
                    Npm($"run {script}", workingDirectory: VsixDirectory);
                }
            }
        });
}
