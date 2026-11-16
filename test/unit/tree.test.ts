import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { RELATIONS, Target, hasRelations, loadGraph, locateGraphFile, relatedTargets, sortTargets } from '../../src/graph';

const target = (name: string, over: Partial<Target> = {}): Target =>
    ({ name, default: false, listed: true, dependsOn: [], after: [], triggeredBy: [], triggers: [], ...over });

const names = (targets: Target[]) => targets.map(t => t.name);

test('sortTargets: listed first, then alphabetical; input is not mutated', () => {
    const input = [target('Zed'), target('Hidden', { listed: false }), target('Alpha'), target('Beta', { listed: false })];
    assert.deepEqual(names(sortTargets(input)), ['Alpha', 'Zed', 'Beta', 'Hidden']);
    assert.deepEqual(names(input), ['Zed', 'Hidden', 'Alpha', 'Beta']);
});

test('hasRelations: true for any relation, false for none', () => {
    assert.equal(hasRelations(target('A')), false);
    for (const relation of RELATIONS) {
        assert.equal(hasRelations(target('A', { [relation]: ['B'] })), true, relation);
    }
});

test('relatedTargets: groups by relation in tree order', () => {
    const a = target('A', { triggers: ['D'], dependsOn: ['B'], after: ['C'], triggeredBy: ['E'] });
    const byName = new Map(['A', 'B', 'C', 'D', 'E'].map(n => [n, n === 'A' ? a : target(n)]));
    assert.deepEqual(
        relatedTargets(a, byName).map(r => `${r.relation}:${r.target.name}`),
        ['dependsOn:B', 'after:C', 'triggeredBy:E', 'triggers:D']);
});

test('relatedTargets: drops names the graph does not declare', () => {
    const a = target('A', { dependsOn: ['Ghost', 'B'] });
    const byName = new Map([['A', a], ['B', target('B')]]);
    assert.deepEqual(relatedTargets(a, byName).map(r => r.target.name), ['B']);
});

test('fixture graph: Compile expands to Restore (depends on) and Pack (triggers)', () => {
    const fixtures = path.resolve(__dirname, '../../../test/fixtures/workspace');
    const graph = loadGraph(locateGraphFile([fixtures])!);
    const byName = new Map(graph.targets.map(t => [t.name, t]));
    const compile = byName.get('Compile')!;

    assert.deepEqual(
        relatedTargets(compile, byName).map(r => `${r.relation}:${r.target.name}`),
        ['dependsOn:Restore', 'triggers:Pack']);
    assert.deepEqual(names(sortTargets(graph.targets)), ['Clean', 'Compile', 'Pack', 'Restore', 'Hidden']);
});
