import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

const TOOL = 'fallout-migrate';
const PACKAGE = 'Fallout.Migrate';
const PROMPTED_KEY = 'fallout.migratePrompted';
const MIGRATION_GUIDE = 'https://github.com/Fallout-build/Fallout/blob/main/docs/Migration/from-nuke.md';
const SKIP_DIRS = new Set(['node_modules', '.git', 'bin', 'obj', '.vs', 'out']);
const MAX_DEPTH = 3;
const NUKE_REFERENCE = /\b(?:Include|Update|Remove)\s*=\s*["']Nuke\./i;

let output: vscode.OutputChannel | undefined;
let busy = false;

const channel = (): vscode.OutputChannel => (output ??= vscode.window.createOutputChannel('Fallout Migrate'));

function isDirectory(p: string): boolean {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

/** The migrator renames a `.nuke/` directory; a legacy single file or an empty folder is not worth migrating. */
function hasNukeDirectory(dir: string): boolean {
    const nuke = path.join(dir, '.nuke');
    try {
        return isDirectory(nuke) && fs.readdirSync(nuke).length > 0;
    } catch {
        return false;
    }
}

function referencesNuke(csproj: string): boolean {
    try {
        return NUKE_REFERENCE.test(fs.readFileSync(csproj, 'utf8'));
    } catch {
        return false;
    }
}

/**
 * Unmigrated NUKE repositories at or below `folder` (a few levels deep, for nested repos).
 * A repository counts when it has a non-empty `.nuke/` directory, or a `_build.csproj` that still
 * references `Nuke.*` (any quote style, `Include`/`Update`/`Remove`), and it has no `.fallout/` yet.
 */
export function findNukeRoots(folder: string): string[] {
    const roots = new Set<string>();
    const walk = (dir: string, depth: number): void => {
        if (isDirectory(path.join(dir, '.fallout'))) {
            return;
        }
        if (hasNukeDirectory(dir)) {
            roots.add(dir);
        }
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        if (entries.some(e => e.isFile() && e.name === '_build.csproj') && referencesNuke(path.join(dir, '_build.csproj'))) {
            roots.add(path.basename(dir) === 'build' ? path.dirname(dir) : dir);
        }
        if (depth >= MAX_DEPTH) {
            return;
        }
        for (const e of entries) {
            if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) {
                walk(path.join(dir, e.name), depth + 1);
            }
        }
    };
    walk(folder, 0);
    // A root that also lost its own .fallout/ check above may have been added from a child; drop migrated ones.
    return [...roots].filter(r => !isDirectory(path.join(r, '.fallout')));
}

/** True when any workspace folder holds an unmigrated NUKE build. */
export function hasNukeRepo(): boolean {
    return (vscode.workspace.workspaceFolders ?? []).some(f => findNukeRoots(f.uri.fsPath).length > 0);
}

function allNukeRoots(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).flatMap(f => findNukeRoots(f.uri.fsPath));
}

async function pickRoot(): Promise<string | undefined> {
    const roots = allNukeRoots();
    if (roots.length === 0) {
        void vscode.window.showInformationMessage('Fallout: no NUKE build found in this workspace.');
        return undefined;
    }
    if (roots.length === 1) {
        return roots[0];
    }
    return vscode.window.showQuickPick(roots, { placeHolder: 'Which NUKE build do you want to migrate?' });
}

/** Absolute path first: a fresh global install is not on the PATH of an already-running VS Code. */
function toolPathOnDisk(): string | undefined {
    const home = process.env.DOTNET_CLI_HOME ?? os.homedir();
    const exe = path.join(home, '.dotnet', 'tools', process.platform === 'win32' ? `${TOOL}.exe` : TOOL);
    return fs.existsSync(exe) ? exe : undefined;
}

function run(command: string, args: string[]): Promise<number> {
    return new Promise(resolve => {
        const log = channel();
        log.appendLine(`> ${command} ${args.join(' ')}`);
        const child = spawn(command, args, { windowsHide: true });
        child.stdout.on('data', d => log.append(String(d)));
        child.stderr.on('data', d => log.append(String(d)));
        child.on('error', e => {
            log.appendLine(`error: ${e.message}`);
            resolve(-1);
        });
        child.on('close', code => resolve(code ?? -1));
    });
}

async function resolveTool(): Promise<string | undefined> {
    const onDisk = toolPathOnDisk();
    if (onDisk) {
        return onDisk;
    }
    // Maybe on PATH somewhere else (custom tool path): ENOENT means it is not.
    return (await run(TOOL, ['--help'])) === -1 ? undefined : TOOL;
}

async function withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, task);
}

function openGuide(): void {
    void vscode.env.openExternal(vscode.Uri.parse(MIGRATION_GUIDE));
}

/**
 * `Fallout: Migrate from NUKE…`: install the tool if needed, run `--dry-run` and wait for it,
 * and only then offer the real run. The preview is mandatory and always first. The real run goes
 * in a fresh terminal because the tool asks "Continue?" itself.
 */
export async function migrateFromNuke(onFinished: () => void): Promise<void> {
    if (busy) {
        void vscode.window.showInformationMessage('Fallout: a migration is already in progress.');
        return;
    }
    busy = true;
    try {
        const root = await pickRoot();
        if (!root) {
            return;
        }

        let tool = await resolveTool();
        if (!tool) {
            const choice = await vscode.window.showInformationMessage(
                `Fallout: the migration tool (${TOOL}) is not installed.`, 'Install and preview', 'Open guide');
            if (choice === 'Open guide') {
                openGuide();
            }
            if (choice !== 'Install and preview') {
                return;
            }
            // `update` installs when absent and upgrades when present, so it never fails on "already installed".
            const code = await withProgress(`Installing ${PACKAGE}…`, () => run('dotnet', ['tool', 'update', '-g', PACKAGE]));
            tool = code === 0 ? await resolveTool() : undefined;
            if (!tool) {
                channel().show(true);
                void vscode.window.showErrorMessage(
                    code === 0
                        ? `Fallout: ${PACKAGE} installed but ${TOOL} was not found. Restart VS Code and try again.`
                        : `Fallout: installing ${PACKAGE} failed. See the "Fallout Migrate" output.`);
                return;
            }
        }

        channel().clear();
        channel().show(true);
        const previewCode = await withProgress('Previewing the NUKE migration…', () => run(tool, ['--dry-run', root]));
        if (previewCode !== 0) {
            void vscode.window.showErrorMessage('Fallout: the migration preview failed. See the "Fallout Migrate" output.');
            return;
        }

        const choice = await vscode.window.showInformationMessage(
            `Fallout: preview done, nothing changed (see the "Fallout Migrate" output). Migrate ${root}?`,
            'Migrate', 'Cancel');
        if (choice !== 'Migrate') {
            return;
        }

        // Fresh terminal, no shell: no quoting problems, no stray input into an earlier "Continue?" prompt.
        const terminal = vscode.window.createTerminal({ name: 'Fallout Migrate', shellPath: tool, shellArgs: [root], cwd: root });
        const closed = vscode.window.onDidCloseTerminal(t => {
            if (t === terminal) {
                closed.dispose();
                onFinished();
            }
        });
        terminal.show();
    } finally {
        busy = false;
    }
}

/** One-time prompt per NUKE repository, whatever the answer (closing the toast counts as "not now"). */
export async function promptIfNukeRepo(context: vscode.ExtensionContext, onFinished: () => void): Promise<void> {
    const prompted = context.workspaceState.get<string[]>(PROMPTED_KEY, []);
    const roots = allNukeRoots().filter(r => !prompted.includes(r));
    if (roots.length === 0) {
        return;
    }
    await context.workspaceState.update(PROMPTED_KEY, [...prompted, ...roots]);
    const choice = await vscode.window.showInformationMessage(
        'This looks like a NUKE build. Migrate it to Fallout?', 'Migrate…', 'Not now');
    if (choice === 'Migrate…') {
        await migrateFromNuke(onFinished);
    }
}
