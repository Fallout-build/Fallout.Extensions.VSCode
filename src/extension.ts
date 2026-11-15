import * as vscode from 'vscode';
import { BuildGraph, GraphSource, RELATIONS, Relation, Target, checkCompatibility, findGraphFile, hasRelations, loadGraph, relatedTargets, sortTargets } from './model';
import { GraphPanel } from './graphPanel';
import { goToTarget } from './goToTarget';
import { isNukeRepo, migrateFromNuke, promptIfNukeRepo } from './migrate';
import { RunConfigStore, RunConfigViewProvider } from './runConfig';

const RELATION_LABELS: Record<Relation, string> = {
    dependsOn: 'depends on',
    after: 'runs after',
    triggeredBy: 'triggered by',
    triggers: 'triggers',
};

const RELATION_ICONS: Record<Relation, string> = {
    dependsOn: 'arrow-right',
    after: 'list-ordered',
    triggeredBy: 'arrow-left',
    triggers: 'zap',
};

class TargetItem extends vscode.TreeItem {
    constructor(
        public readonly target: Target,
        relation: Relation | undefined,
        hasChildren: boolean,
    ) {
        super(
            target.name,
            hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
        );
        this.contextValue = 'falloutTarget';
        this.description = relation
            ? RELATION_LABELS[relation]
            : [target.default ? 'default' : undefined, target.description ?? undefined]
                .filter(Boolean)
                .join(' — ');
        this.iconPath = relation
            ? new vscode.ThemeIcon(RELATION_ICONS[relation])
            : new vscode.ThemeIcon(
                target.default ? 'rocket' : target.listed ? 'circle-large-outline' : 'circle-slash',
                target.listed ? undefined : new vscode.ThemeColor('disabledForeground'));
        const lines = [
            `**${target.name}**${target.default ? ' _(default target)_' : ''}${target.listed ? '' : ' _(unlisted)_'}`,
            target.description ?? undefined,
            ...RELATIONS
                .filter(r => target[r].length > 0)
                .map(r => `${RELATION_LABELS[r]}: ${target[r].join(', ')}`),
        ];
        this.tooltip = new vscode.MarkdownString(lines.filter(Boolean).join('\n\n'));
    }
}

class FalloutTargetsProvider implements vscode.TreeDataProvider<TargetItem> {
    constructor(private readonly extensionVersion: string) {}

    private onDidChangeEmitter = new vscode.EventEmitter<TargetItem | undefined | void>();
    readonly onDidChangeTreeData = this.onDidChangeEmitter.event;

    private byName = new Map<string, Target>();
    source: GraphSource | undefined;
    graph: BuildGraph | undefined;

    refresh(): void {
        this.onDidChangeEmitter.fire();
    }

    getTreeItem(element: TargetItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TargetItem): vscode.ProviderResult<TargetItem[]> {
        if (!element) {
            return this.loadRoots();
        }
        // Children: one entry per related target, recursively expandable.
        return relatedTargets(element.target, this.byName)
            .map(({ relation, target }) => new TargetItem(target, relation, hasRelations(target)));
    }

    private loadRoots(): TargetItem[] {
        this.source = findGraphFile();
        if (!this.source) {
            this.byName.clear();
            this.graph = undefined;
            return []; // empty view -> viewsWelcome content kicks in
        }
        try {
            this.graph = loadGraph(this.source);
        } catch (e) {
            void vscode.window.showWarningMessage(`Fallout: could not parse ${this.source.file}: ${e}`);
            return [];
        }
        checkCompatibility(this.graph, this.extensionVersion);
        this.byName = new Map(this.graph.targets.map(t => [t.name, t]));
        return sortTargets(this.graph.targets).map(t => new TargetItem(t, undefined, hasRelations(t)));
    }
}

/**
 * Placeholder for the Deployment view. The continuous-delivery graph (channels →
 * environments → targets, ADR-0009) is not emitted by the framework yet, so this
 * returns nothing and the view shows its welcome content. It becomes real once the
 * build writes a deployment-graph.json.
 */
class DeploymentProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }
    getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
        return [];
    }
}

function runInTerminal(root: string, args: string, env?: Record<string, string>): void {
    const hasEnv = env !== undefined && Object.keys(env).length > 0;
    let terminal = vscode.window.terminals.find(t => t.name === 'Fallout');
    if (hasEnv) {
        // Terminal env is fixed at creation; recreate so the current secrets apply.
        terminal?.dispose();
        terminal = vscode.window.createTerminal({ name: 'Fallout', cwd: root, env });
    } else {
        terminal ??= vscode.window.createTerminal({ name: 'Fallout', cwd: root });
    }
    terminal.show();
    terminal.sendText(process.platform === 'win32' ? `./build.ps1 ${args}` : `./build.sh ${args}`);
}

export function activate(context: vscode.ExtensionContext): void {
    const extensionVersion: string = context.extension.packageJSON.version;
    const provider = new FalloutTargetsProvider(extensionVersion);
    const runConfig = new RunConfigStore(context);

    const workspaceRoot = () => provider.source?.root ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    // Silent run (▶): apply saved parameters as args and secrets as env.
    const runTarget = async (name: string): Promise<void> => {
        const root = workspaceRoot();
        if (!root) { return; }
        const args = [name, runConfig.buildArgs()].filter(Boolean).join(' ');
        runInTerminal(root, args, await runConfig.buildEnv());
    };

    // Prompt run: prefill with target + saved args, let the user tweak before running.
    const runTargetWithParameters = async (name: string): Promise<void> => {
        const root = workspaceRoot();
        if (!root) { return; }
        const edited = await vscode.window.showInputBox({
            title: `Run ${name}`,
            prompt: 'Arguments passed to the Fallout build (secrets are still applied as environment variables)',
            value: [name, runConfig.buildArgs()].filter(Boolean).join(' '),
        });
        if (edited === undefined) { return; } // cancelled
        runInTerminal(root, edited, await runConfig.buildEnv());
    };

    const refreshAll = () => {
        provider.refresh();
        const source = findGraphFile();
        if (source) {
            try {
                GraphPanel.refresh(loadGraph(source));
            } catch {
                // transient: the build may be mid-write; the next watcher event re-reads it
            }
        }
    };

    const watcher = vscode.workspace.createFileSystemWatcher('**/build-graph.json');
    watcher.onDidChange(refreshAll);
    watcher.onDidCreate(refreshAll);
    watcher.onDidDelete(() => provider.refresh());

    context.subscriptions.push(
        // Same provider instance backs both the Fallout-container Build view and the
        // mirrored Explorer dock — one graph, two homes; refresh() updates both.
        vscode.window.registerTreeDataProvider('fallout.build', provider),
        vscode.window.registerTreeDataProvider('fallout.buildExplorer', provider),
        vscode.window.registerTreeDataProvider('fallout.deployment', new DeploymentProvider()),
        vscode.window.registerWebviewViewProvider('fallout.runConfig', new RunConfigViewProvider(runConfig, context.subscriptions)),
        watcher,
        vscode.commands.registerCommand('fallout.refreshTargets', refreshAll),
        vscode.commands.registerCommand('fallout.runTarget', (item?: TargetItem) => {
            if (item?.target) {
                void runTarget(item.target.name);
            }
        }),
        vscode.commands.registerCommand('fallout.runTargetWithParameters', (item?: TargetItem) => {
            if (item?.target) {
                void runTargetWithParameters(item.target.name);
            }
        }),
        vscode.commands.registerCommand('fallout.goToTarget', (item?: TargetItem) => {
            if (item?.target) {
                void goToTarget(item.target);
            }
        }),
        vscode.commands.registerCommand('fallout.showGraph', () => {
            const source = findGraphFile();
            if (!source) {
                void vscode.window.showInformationMessage('Fallout: no build-graph.json found. Run the build once (e.g. ./build.ps1 --help) first.');
                return;
            }
            try {
                provider.source ??= source;
                const graph = loadGraph(source);
                checkCompatibility(graph, extensionVersion);
                GraphPanel.createOrShow(context.extensionUri, graph, name => void runTarget(name));
            } catch (e) {
                void vscode.window.showWarningMessage(`Fallout: could not parse ${source.file}: ${e}`);
            }
        }),
        vscode.commands.registerCommand('fallout.planTarget', () => {
            const root = workspaceRoot();
            if (root) {
                runInTerminal(root, '--plan');
            }
        }),
    );

    // Drives the "migrate from NUKE" welcome content in the empty Build views.
    const updateNukeContext = () => void vscode.commands.executeCommand(
        'setContext', 'fallout.nukeRepo', (vscode.workspace.workspaceFolders ?? []).some(f => isNukeRepo(f.uri.fsPath)));
    updateNukeContext();

    // The migrator renames .nuke/ to .fallout/ - re-evaluate the NUKE content when that lands.
    const falloutDirWatcher = vscode.workspace.createFileSystemWatcher('**/.fallout');
    falloutDirWatcher.onDidCreate(() => { updateNukeContext(); provider.refresh(); });
    falloutDirWatcher.onDidDelete(() => { updateNukeContext(); provider.refresh(); });

    context.subscriptions.push(
        falloutDirWatcher,
        vscode.commands.registerCommand('fallout.migrateFromNuke', () => migrateFromNuke(workspaceRoot())),
    );

    void promptIfNukeRepo(context, workspaceRoot());
}

export function deactivate(): void {}
