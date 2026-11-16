import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

const EXTENSION_ID = 'fallout.fallout';
const COMMANDS = [
    'fallout.refreshTargets', 'fallout.runTarget', 'fallout.runTargetWithParameters',
    'fallout.goToTarget', 'fallout.showGraph', 'fallout.planTarget',
];

suite('extension host', () => {
    suiteSetup(async () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext, `extension ${EXTENSION_ID} not found`);
        await ext.activate();
    });

    test('activates on the fixture workspace', () => {
        assert.equal(vscode.extensions.getExtension(EXTENSION_ID)?.isActive, true);
    });

    test('registers every contributed command', async () => {
        const all = await vscode.commands.getCommands(true);
        for (const id of COMMANDS) {
            assert.ok(all.includes(id), `${id} not registered`);
        }
    });

    // Build.cs and ICompile.cs both declare `Target Compile`; `declaredIn` has to pick between them.
    for (const [declaredIn, file] of [['Build', 'Build.cs'], ['ICompile', 'ICompile.cs']]) {
        test(`goToTarget opens ${file} when the target is declared in ${declaredIn}`, async () => {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            // Same shape as a TargetItem: the command only reads `.target`.
            const item = { target: { name: 'Compile', declaredIn, default: true, listed: true, dependsOn: [], after: [], triggeredBy: [], triggers: [] } };
            await vscode.commands.executeCommand('fallout.goToTarget', item);

            // The command is fire-and-forget, and the editor becomes active before its selection
            // is applied, so wait for the final state rather than the first sign of an editor.
            const editor = await waitFor(() => {
                const active = vscode.window.activeTextEditor;
                return active
                    && path.basename(active.document.fileName) === file
                    && /Target Compile =>/.test(active.document.lineAt(active.selection.start.line).text)
                    ? active : undefined;
            }, `${file} open with the selection on "Target Compile =>"`);
            assert.equal(path.basename(editor.document.fileName), file);
        });
    }

    test('showGraph opens the graph panel', async () => {
        await vscode.commands.executeCommand('fallout.showGraph');
        const tab = await waitFor(() => vscode.window.tabGroups.all
            .flatMap(g => g.tabs)
            .find(t => t.label === 'Fallout Build Graph'), 'a tab labelled "Fallout Build Graph"');
        assert.equal(tab.label, 'Fallout Build Graph');
    });
});

async function waitFor<T>(probe: () => T | undefined, what: string, timeoutMs = 15000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = probe();
        if (value !== undefined) {
            return value;
        }
        if (Date.now() > deadline) {
            throw new Error(`timed out waiting for ${what}`);
        }
        await new Promise(r => setTimeout(r, 100));
    }
}
