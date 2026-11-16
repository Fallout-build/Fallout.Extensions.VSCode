import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BuildGraph, SUPPORTED_SCHEMA_VERSION, compatibilityMessage, loadGraph, locateGraphFile, toMermaid } from '../../src/graph';

// Compiled to out-test/test/unit, so the repo root is three levels up.
const fixtures = path.resolve(__dirname, '../../../test/fixtures');

type Target = BuildGraph['targets'][number];

const target = (name: string, over: Partial<Target> = {}): Target =>
    ({ name, default: false, listed: true, dependsOn: [], after: [], triggeredBy: [], triggers: [], ...over });

const graph = (targets: Target[], over: Partial<BuildGraph> = {}): BuildGraph =>
    ({ version: SUPPORTED_SCHEMA_VERSION, targets, ...over });

test('toMermaid: dependsOn is solid, prerequisite -> dependent', () => {
    const out = toMermaid(graph([target('A'), target('B', { dependsOn: ['A'] })]));
    assert.match(out, /^ {2}A --> B$/m);
});

test('toMermaid: after is dashed', () => {
    const out = toMermaid(graph([target('A'), target('B', { after: ['A'] })]));
    assert.match(out, /^ {2}A -\.-> B$/m);
});

test('toMermaid: triggers is thick, and triggeredBy adds no duplicate edge', () => {
    const out = toMermaid(graph([target('A', { triggers: ['B'] }), target('B', { triggeredBy: ['A'] })]));
    assert.match(out, /^ {2}A ==> B$/m);
    assert.equal(out.split('\n').filter(l => l.includes('==>')).length, 1);
});

test('toMermaid: marks default and unlisted targets', () => {
    const out = toMermaid(graph([target('A', { default: true }), target('B', { listed: false })]));
    assert.match(out, /class A defaultTarget/);
    assert.match(out, /class B unlisted/);
});

test('toMermaid: omits class lines when nothing is default or unlisted', () => {
    const out = toMermaid(graph([target('A')]));
    assert.doesNotMatch(out, /^ {2}class /m);
});

test('compatibilityMessage: matching line is silent, patch and prerelease ignored', () => {
    assert.equal(compatibilityMessage(graph([], { falloutVersion: '10.4.0' }), '10.4.37'), undefined);
    assert.equal(compatibilityMessage(graph([], { falloutVersion: '10.4.2-rc.1' }), '10.4.0'), undefined);
});

test('compatibilityMessage: major.minor drift warns', () => {
    assert.match(compatibilityMessage(graph([], { falloutVersion: '10.5.0' }), '10.4.0')!, /10\.5\.0.*10\.4\.0/);
    assert.match(compatibilityMessage(graph([], { falloutVersion: '11.0.0' }), '10.4.0')!, /11\.0\.0/);
});

test('compatibilityMessage: unknown schema version is the hard gate', () => {
    assert.match(compatibilityMessage(graph([], { version: 99, falloutVersion: '10.4.0' }), '10.4.0')!, /schema v99/);
});

test('compatibilityMessage: missing falloutVersion is silent', () => {
    assert.equal(compatibilityMessage(graph([]), '10.4.0'), undefined);
});

test('locateGraphFile: finds .fallout/temp', () => {
    const root = path.join(fixtures, 'workspace');
    assert.deepEqual(locateGraphFile([root]), { root, file: path.join(root, '.fallout', 'temp', 'build-graph.json') });
});

test('locateGraphFile: falls back to legacy .nuke/temp, prefers .fallout, searches roots in order', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fallout-graph-'));
    try {
        const legacy = path.join(tmp, 'legacy');
        const both = path.join(tmp, 'both');
        const empty = path.join(tmp, 'empty');
        for (const [root, dir] of [[legacy, '.nuke'], [both, '.nuke'], [both, '.fallout']]) {
            fs.mkdirSync(path.join(root, dir, 'temp'), { recursive: true });
            fs.writeFileSync(path.join(root, dir, 'temp', 'build-graph.json'), '{}');
        }
        fs.mkdirSync(empty);

        assert.equal(locateGraphFile([legacy])?.file, path.join(legacy, '.nuke', 'temp', 'build-graph.json'));
        assert.equal(locateGraphFile([both])?.file, path.join(both, '.fallout', 'temp', 'build-graph.json'));
        assert.equal(locateGraphFile([empty, legacy])?.root, legacy);
        assert.equal(locateGraphFile([empty]), undefined);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('loadGraph: parses the fixture graph', () => {
    const loaded = loadGraph(locateGraphFile([path.join(fixtures, 'workspace')])!);
    assert.equal(loaded.version, SUPPORTED_SCHEMA_VERSION);
    assert.equal(loaded.targets.length, 5);
    assert.deepEqual(loaded.targets.find(t => t.name === 'Compile')?.triggers, ['Pack']);
});
