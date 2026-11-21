import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findNukeRoots } from '../../src/nuke';

/** Builds a throwaway repo from `{ 'relative/path': 'contents' }`; a path ending in `/` is an empty directory. */
function repo(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fallout-nuke-'));
    for (const [rel, text] of Object.entries(files)) {
        const full = path.join(root, rel);
        if (rel.endsWith('/')) {
            fs.mkdirSync(full, { recursive: true });
        } else {
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, text);
        }
    }
    return root;
}

const nukeCsproj = (attr: string) => `<Project><ItemGroup><PackageReference ${attr} Version="9.0.0" /></ItemGroup></Project>`;

test('a non-empty .nuke directory marks the repo', () => {
    const root = repo({ '.nuke/parameters.json': '{}' });
    assert.deepEqual(findNukeRoots(root), [root]);
});

for (const [name, attr] of [
    ['double quotes', 'Include="Nuke.Common"'],
    ['single quotes', "Include='Nuke.Common'"],
    ['Update=', 'Update="Nuke.Common"'],
    ['spaces around =', 'Include = "Nuke.Common"'],
]) {
    test(`build/_build.csproj with Nuke.* (${name}) marks the repo root`, () => {
        const root = repo({ 'build/_build.csproj': nukeCsproj(attr) });
        assert.deepEqual(findNukeRoots(root), [root]);
    });
}

test('_build.csproj outside a build/ folder marks its own directory', () => {
    const root = repo({ 'tooling/_build.csproj': nukeCsproj('Include="Nuke.Common"') });
    assert.deepEqual(findNukeRoots(root), [path.join(root, 'tooling')]);
});

test('a build project that references Fallout.* is not NUKE', () => {
    const root = repo({ 'build/_build.csproj': nukeCsproj('Include="Fallout.Common"') });
    assert.deepEqual(findNukeRoots(root), []);
});

test('an existing .fallout directory means already migrated', () => {
    const root = repo({ '.nuke/parameters.json': '{}', '.fallout/parameters.json': '{}' });
    assert.deepEqual(findNukeRoots(root), []);
});

test('an empty .nuke directory and a legacy .nuke file do not count', () => {
    assert.deepEqual(findNukeRoots(repo({ '.nuke/': '' })), []);
    assert.deepEqual(findNukeRoots(repo({ '.nuke': 'legacy' })), []);
});

test('nested repositories are found, each with its own root', () => {
    const root = repo({
        'services/a/.nuke/parameters.json': '{}',
        'services/b/build/_build.csproj': nukeCsproj('Include="Nuke.Common"'),
    });
    assert.deepEqual(findNukeRoots(root).sort(), [path.join(root, 'services/a'), path.join(root, 'services/b')].sort());
});

test('a migrated repo nested in a NUKE repo is skipped, the outer one is kept', () => {
    const root = repo({ '.nuke/parameters.json': '{}', 'inner/.nuke/x': '', 'inner/.fallout/x': '' });
    assert.deepEqual(findNukeRoots(root), [root]);
});

test('node_modules, bin, obj and dot-directories are not scanned', () => {
    const root = repo({
        'node_modules/pkg/.nuke/x': '',
        'src/bin/.nuke/x': '',
        '.cache/.nuke/x': '',
    });
    assert.deepEqual(findNukeRoots(root), []);
});

test('scanning stops below the depth limit', () => {
    const root = repo({ 'a/b/c/d/.nuke/x': '' });
    assert.deepEqual(findNukeRoots(root), []);
});

test('a missing folder yields nothing instead of throwing', () => {
    assert.deepEqual(findNukeRoots(path.join(os.tmpdir(), 'fallout-does-not-exist')), []);
});
