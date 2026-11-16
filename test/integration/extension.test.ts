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

    test('goToTarget opens Build.cs at the declaration', async () => {
        // Same shape as a TargetItem: the command only reads `.target`.
        const item = { target: { name: 'Compile', declaredIn: 'Build', default: true, listed: true, dependsOn: [], after: [], triggeredBy: [], triggers: [] } };
        await vscode.commands.executeCommand('fallout.goToTarget', item);

        const editor = await waitFor(() =>
            vscode.window.activeTextEditor?.document.fileName.endsWith('Build.cs') ? vscode.window.activeTextEditor : undefined);
        assert.equal(path.basename(editor.document.fileName), 'Build.cs');
        assert.match(editor.document.lineAt(editor.selection.start.line).text, /Target Compile =>/);
    });

    test('showGraph opens the graph panel', async () => {
        await vscode.commands.executeCommand('fallout.showGraph');
        const tab = await waitFor(() => vscode.window.tabGroups.all
            .flatMap(g => g.tabs)
            .find(t => t.label === 'Fallout Build Graph'));
        assert.equal(tab.label, 'Fallout Build Graph');
    });
});

async function waitFor<T>(probe: () => T | undefined, timeoutMs = 15000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = probe();
        if (value !== undefined) {
            return value;
        }
        if (Date.now() > deadline) {
            throw new Error('timed out waiting for condition');
        }
        await new Promise(r => setTimeout(r, 100));
    }
}
