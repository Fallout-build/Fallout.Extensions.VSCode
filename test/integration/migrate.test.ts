import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { openMigrationTerminal } from '../../src/migrate';

// Inside the extension host process.execPath is VS Code itself, so find a real Node on PATH.
function findNode(): string {
    const exe = process.platform === 'win32' ? 'node.exe' : 'node';
    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
        const candidate = path.join(dir, exe);
        if (dir && fs.existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error('node not found on PATH');
}
const NODE = findNode();

suite('migrate terminal', () => {
    // The real run is a shell-less terminal around fallout-migrate. A stand-in script (run by Node)
    // plays the tool: it renames .nuke to .fallout like the migrator and exits.
    test('onFinished fires after the migrator exits, and the rename has happened by then', async () => {
        const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'fallout-migrate-'));
        fs.mkdirSync(path.join(repo, '.nuke'));
        fs.writeFileSync(path.join(repo, '.nuke', 'parameters.json'), '{}');
        const script = path.join(repo, 'fake-migrate.js');
        fs.writeFileSync(script, [
            "const fs = require('fs'), path = require('path');",
            'const root = process.argv[2];',
            "console.log('fake migrate: ' + root);",
            "fs.renameSync(path.join(root, '.nuke'), path.join(root, '.fallout'));",
        ].join('\n'));

        let renamedWhenFinished: boolean | undefined;
        let terminal: vscode.Terminal | undefined;
        const finished = new Promise<void>(resolve => {
            terminal = openMigrationTerminal(NODE, [script, repo], repo, () => {
                renamedWhenFinished = fs.existsSync(path.join(repo, '.fallout')) && !fs.existsSync(path.join(repo, '.nuke'));
                resolve();
            });
        });

        await Promise.race([
            finished,
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(
                `onFinished never fired (exitStatus=${JSON.stringify(terminal?.exitStatus)}, .fallout exists=${fs.existsSync(path.join(repo, '.fallout'))}, terminals=${vscode.window.terminals.length})`)), 20000)),
        ]);
        assert.equal(renamedWhenFinished, true);
    });

    test('every call opens its own terminal', () => {
        const before = vscode.window.terminals.length;
        const a = openMigrationTerminal(NODE, ['-e', 'setTimeout(()=>{},60000)'], os.tmpdir(), () => undefined);
        const b = openMigrationTerminal(NODE, ['-e', 'setTimeout(()=>{},60000)'], os.tmpdir(), () => undefined);
        assert.notStrictEqual(a, b);
        assert.equal(vscode.window.terminals.length, before + 2);
        a.dispose();
        b.dispose();
    });
});
