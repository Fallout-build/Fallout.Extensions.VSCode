import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

const TOOL = 'fallout-migrate';
const INSTALL = 'dotnet tool install -g Fallout.Migrate';
const DISMISSED_KEY = 'fallout.migratePromptDismissed';
const MIGRATION_GUIDE = 'https://github.com/Fallout-build/Fallout/blob/main/docs/Migration/from-nuke.md';

/**
 * A NUKE build that has not been migrated: it still has a `.nuke/` directory (the migrator renames it
 * to `.fallout/`), or its build project still references `Nuke.*`, and there is no `.fallout/` yet.
 */
export function isNukeRepo(root: string): boolean {
    if (fs.existsSync(path.join(root, '.fallout'))) {
        return false;
    }
    if (fs.existsSync(path.join(root, '.nuke'))) {
        return true;
    }
    try {
        return /Include="Nuke\./.test(fs.readFileSync(path.join(root, 'build', '_build.csproj'), 'utf8'));
    } catch {
        return false;
    }
}

/** Resolves whether the migrator is on PATH; it is a dotnet global tool, so a missing tool is ENOENT. */
function isToolInstalled(): Promise<boolean> {
    return new Promise(resolve => {
        execFile(TOOL, ['--help'], { timeout: 15000 }, error => {
            resolve(!(error && (error as NodeJS.ErrnoException).code === 'ENOENT'));
        });
    });
}

function runInMigrateTerminal(root: string, commandLine: string): void {
    let terminal = vscode.window.terminals.find(t => t.name === 'Fallout Migrate');
    terminal ??= vscode.window.createTerminal({ name: 'Fallout Migrate', cwd: root });
    terminal.show();
    terminal.sendText(commandLine);
}

/**
 * `Fallout: Migrate from NUKE…` — preview with `--dry-run`, then migrate once the user confirms.
 * Both run in the integrated terminal because the tool prompts before it changes anything.
 */
export async function migrateFromNuke(root: string | undefined): Promise<void> {
    if (!root) {
        void vscode.window.showInformationMessage('Fallout: open the NUKE build\'s repository folder first.');
        return;
    }

    if (!(await isToolInstalled())) {
        const choice = await vscode.window.showInformationMessage(
            `Fallout: the migration tool (${TOOL}) is not installed.`,
            `Install and preview`, 'Open guide');
        if (choice === 'Open guide') {
            void vscode.env.openExternal(vscode.Uri.parse(MIGRATION_GUIDE));
        } else if (choice) {
            runInMigrateTerminal(root, `${INSTALL} && ${TOOL} --dry-run`);
            await offerMigration(root);
        }
        return;
    }

    const choice = await vscode.window.showInformationMessage(
        'Fallout: migrate this NUKE build to Fallout? A preview changes nothing.',
        'Preview (dry run)', 'Migrate now');
    if (choice === 'Preview (dry run)') {
        runInMigrateTerminal(root, `${TOOL} --dry-run`);
        await offerMigration(root);
    } else if (choice === 'Migrate now') {
        runInMigrateTerminal(root, TOOL);
    }
}

// The preview runs in a terminal we cannot await, so ask once the user has had a chance to read it.
async function offerMigration(root: string): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
        'Fallout: preview is running in the "Fallout Migrate" terminal. Migrate when you have read it.',
        'Migrate now');
    if (choice === 'Migrate now') {
        runInMigrateTerminal(root, TOOL);
    }
}

/** One-time prompt in an unmigrated NUKE repo; "Don't ask again" is remembered per workspace. */
export async function promptIfNukeRepo(
    context: vscode.ExtensionContext,
    root: string | undefined,
): Promise<void> {
    if (!root || !isNukeRepo(root) || context.workspaceState.get<boolean>(DISMISSED_KEY)) {
        return;
    }
    const choice = await vscode.window.showInformationMessage(
        'This looks like a NUKE build. Migrate it to Fallout?',
        'Migrate…', 'Don\'t ask again');
    if (choice === 'Migrate…') {
        await migrateFromNuke(root);
    } else if (choice === 'Don\'t ask again') {
        await context.workspaceState.update(DISMISSED_KEY, true);
    }
}
