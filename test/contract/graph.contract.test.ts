import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { BuildGraph, RELATIONS, SUPPORTED_SCHEMA_VERSION, compatibilityMessage, loadGraph, locateGraphFile, relatedTargets, toMermaid } from '../../src/graph';

// Contract test: the extension's reading of build-graph.json against a graph the real Fallout
// build emitted (`npm run test:contract` regenerates it by running this repo's own build).
// Point FALLOUT_GRAPH at another graph to check a different framework version.
//
// Compiled to out-test/test/contract, so the repo root is three levels up.
const repoRoot = path.resolve(__dirname, '../../..');

function emittedGraph() {
    const override = process.env.FALLOUT_GRAPH;
    const source = override
        ? { root: path.dirname(override), file: override }
        : locateGraphFile([repoRoot]);
    assert.ok(source, 'no build-graph.json found. Run `npm run test:contract` (or any Fallout build) first.');
    return { source, graph: loadGraph(source) as BuildGraph };
}

/** The framework line this extension declares in version.json (JSONC, so not JSON.parse). */
function declaredLine(): string {
    const text = fs.readFileSync(path.join(repoRoot, 'version.json'), 'utf8');
    const match = /"version"\s*:\s*"(\d+\.\d+)"/.exec(text);
    assert.ok(match, 'could not read "version" from version.json');
    return match[1];
}

test('schema version is the one this extension understands', () => {
    assert.equal(emittedGraph().graph.version, SUPPORTED_SCHEMA_VERSION);
});

test('falloutVersion is present and parses as major.minor[.patch[.height]][-label]', () => {
    const { falloutVersion } = emittedGraph().graph;
    assert.match(falloutVersion ?? '', /^\d+\.\d+(\.\d+){0,2}(-[\w.]+)?$/);
});

test('every target has the shape the extension reads', () => {
    const { graph } = emittedGraph();
    assert.ok(Array.isArray(graph.targets) && graph.targets.length > 0, 'targets must be a non-empty array');
    for (const t of graph.targets) {
        // The graph webview splits Mermaid node ids on '-', so names must be plain identifiers.
        assert.match(t.name, /^[A-Za-z_]\w*$/, `target name ${JSON.stringify(t.name)}`);
        assert.equal(typeof t.default, 'boolean', `${t.name}.default`);
        assert.equal(typeof t.listed, 'boolean', `${t.name}.listed`);
        assert.ok(t.description == null || typeof t.description === 'string', `${t.name}.description`);
        assert.ok(t.declaredIn == null || typeof t.declaredIn === 'string', `${t.name}.declaredIn`);
        for (const relation of RELATIONS) {
            assert.ok(Array.isArray(t[relation]), `${t.name}.${relation} must be an array`);
            assert.ok(t[relation].every(n => typeof n === 'string'), `${t.name}.${relation} must hold strings`);
        }
    }
});

test('target names are unique', () => {
    const names = emittedGraph().graph.targets.map(t => t.name);
    assert.equal(new Set(names).size, names.length);
});

test('every relation points at a target the graph declares', () => {
    const { graph } = emittedGraph();
    const known = new Set(graph.targets.map(t => t.name));
    for (const t of graph.targets) {
        for (const relation of RELATIONS) {
            for (const name of t[relation]) {
                assert.ok(known.has(name), `${t.name}.${relation} -> unknown target ${name}`);
            }
        }
    }
});

test('triggers and triggeredBy are mirror images (toMermaid emits triggers alone)', () => {
    const { graph } = emittedGraph();
    for (const t of graph.targets) {
        for (const other of t.triggers) {
            assert.ok(graph.targets.find(x => x.name === other)?.triggeredBy.includes(t.name),
                `${t.name} triggers ${other}, but ${other}.triggeredBy does not list ${t.name}`);
        }
        for (const other of t.triggeredBy) {
            assert.ok(graph.targets.find(x => x.name === other)?.triggers.includes(t.name),
                `${t.name} is triggeredBy ${other}, but ${other}.triggers does not list ${t.name}`);
        }
    }
});

test('the tree can expand every target without dropping a relation', () => {
    const { graph } = emittedGraph();
    const byName = new Map(graph.targets.map(t => [t.name, t]));
    for (const t of graph.targets) {
        const declared = RELATIONS.reduce((n, r) => n + t[r].length, 0);
        assert.equal(relatedTargets(t, byName).length, declared, t.name);
    }
});

test('toMermaid yields one node per target and no edge to an unknown node', () => {
    const { graph } = emittedGraph();
    const lines = toMermaid(graph).split('\n');
    const nodes = new Set(lines.map(l => /^ {2}(\w+)\["/.exec(l)?.[1]).filter(Boolean));
    assert.equal(nodes.size, graph.targets.length);
    for (const edge of lines.map(l => /^ {2}(\w+) (?:-->|-\.->|==>) (\w+)$/.exec(l)).filter(Boolean)) {
        assert.ok(nodes.has(edge![1]) && nodes.has(edge![2]), `edge ${edge![0].trim()} references an unknown node`);
    }
});

test('no compatibility warning when the extension targets the graph\'s framework line', () => {
    const { graph } = emittedGraph();
    if (process.env.FALLOUT_GRAPH) {
        return; // a graph from another framework version is expected to warn
    }
    assert.equal(compatibilityMessage(graph, `${declaredLine()}.0`), undefined);
});
