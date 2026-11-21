import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { findNukeRoots } from './nuke';

const TOOL = 'fallout-migrate';
const PACKAGE = 'Fallout.Migrate';
const PROMPTED_KEY = 'fallout.migratePrompted';
const MIGRATION_GUIDE = 'https://github.com/Fallout-build/Fallout/blob/main/docs/Migration/from-nuke.md';

let output: vscode.OutputChannel | undefined;
let busy = false;

const channel = (): vscode.OutputChannel => (output ??= vscode.window.createOutputChannel('Fallout Migrate'));

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
 * Runs the migrator in a fresh terminal: no shell, so no quoting problems, and no stray input into an
 * earlier "Continue?" prompt. `onFinished` fires once when the migrator exits. The terminal stays open
 * after the process ends (it keeps the summary readable), so the close event alone is not enough:
 * `exitStatus` is polled too, and whichever comes first wins.
 */
export function openMigrationTerminal(tool: string, args: string[], cwd: string, onFinished: () => void): vscode.Terminal {
    const terminal = vscode.window.createTerminal({ name: 'Fallout Migrate', shellPath: tool, shellArgs: args, cwd });
    let done = false;
    const finish = (): void => {
        if (done) {
            return;
        }
        done = true;
        closed.dispose();
        clearInterval(poll);
        onFinished();
    };
    const closed = vscode.window.onDidCloseTerminal(t => t === terminal && finish());
    const poll = setInterval(() => terminal.exitStatus !== undefined && finish(), 500);
    terminal.show();
    return terminal;
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

        openMigrationTerminal(tool, [root], root, onFinished);
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
