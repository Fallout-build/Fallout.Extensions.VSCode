import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { RunConfigContext, RunConfigStore, quoteArg } from '../../src/runConfigStore';

/** In-memory stand-ins for workspaceState and SecretStorage. */
function fakeContext() {
    const state = new Map<string, unknown>();
    const secrets = new Map<string, string>();
    const context: RunConfigContext = {
        workspaceState: {
            get: <T>(key: string, defaultValue: T) => (state.has(key) ? state.get(key) : defaultValue) as T,
            update: async (key, value) => { state.set(key, value); },
        },
        secrets: {
            store: async (key, value) => { secrets.set(key, value); },
            get: async key => secrets.get(key),
            delete: async key => { secrets.delete(key); },
        },
    };
    return { context, state, secrets };
}

test('quoteArg: leaves plain values alone, quotes whitespace, escapes embedded quotes', () => {
    assert.equal(quoteArg('Release'), 'Release');
    assert.equal(quoteArg('a b'), '"a b"');
    assert.equal(quoteArg('say "hi" now'), '"say \\"hi\\" now"');
});

test('buildArgs: renders parameters as --name value, sorted by name', async () => {
    const { context } = fakeContext();
    const store = new RunConfigStore(context);
    await store.setParameter('verbosity', 'quiet');
    await store.setParameter('configuration', 'Release');
    await store.setParameter('message', 'hello world');
    assert.equal(store.buildArgs(), '--configuration Release --message "hello world" --verbosity quiet');
});

test('buildArgs: empty when there are no parameters', () => {
    assert.equal(new RunConfigStore(fakeContext().context).buildArgs(), '');
});

test('setParameter: replaces an existing parameter instead of duplicating it', async () => {
    const store = new RunConfigStore(fakeContext().context);
    await store.setParameter('configuration', 'Debug');
    await store.setParameter('configuration', 'Release');
    assert.deepEqual(store.getParameters(), [{ name: 'configuration', value: 'Release' }]);
});

test('removeParameter: removes only the named parameter', async () => {
    const store = new RunConfigStore(fakeContext().context);
    await store.setParameter('a', '1');
    await store.setParameter('b', '2');
    await store.removeParameter('a');
    assert.deepEqual(store.getParameters(), [{ name: 'b', value: '2' }]);
});

test('secrets: values go to secret storage, only names reach workspace state', async () => {
    const { context, state, secrets } = fakeContext();
    const store = new RunConfigStore(context);
    await store.setSecret('NuGetApiKey', 's3cret');

    assert.deepEqual(store.getSecretNames(), ['NuGetApiKey']);
    assert.equal(secrets.get('fallout.secret.NuGetApiKey'), 's3cret');
    assert.ok(!JSON.stringify([...state.entries()]).includes('s3cret'), 'secret value leaked into workspace state');
});

test('secrets: names stay unique and sorted', async () => {
    const store = new RunConfigStore(fakeContext().context);
    await store.setSecret('B', '1');
    await store.setSecret('A', '1');
    await store.setSecret('B', '2');
    assert.deepEqual(store.getSecretNames(), ['A', 'B']);
});

test('buildEnv: resolves stored secrets, skips names whose value is gone', async () => {
    const { context, secrets } = fakeContext();
    const store = new RunConfigStore(context);
    await store.setSecret('A', 'one');
    await store.setSecret('B', 'two');
    secrets.delete('fallout.secret.B');
    assert.deepEqual(await store.buildEnv(), { A: 'one' });
});

test('buildArgs never contains secrets', async () => {
    const store = new RunConfigStore(fakeContext().context);
    await store.setSecret('NuGetApiKey', 's3cret');
    await store.setParameter('configuration', 'Release');
    assert.ok(!store.buildArgs().includes('s3cret'));
});

test('removeSecret: deletes value and name', async () => {
    const { context, secrets } = fakeContext();
    const store = new RunConfigStore(context);
    await store.setSecret('A', 'one');
    await store.removeSecret('A');
    assert.deepEqual(store.getSecretNames(), []);
    assert.equal(secrets.size, 0);
});

test('onDidChange: fires on every mutation, stops after dispose', async () => {
    const store = new RunConfigStore(fakeContext().context);
    let fired = 0;
    const subscription = store.onDidChange(() => { fired++; });
    await store.setParameter('a', '1');
    await store.removeParameter('a');
    await store.setSecret('S', 'v');
    await store.removeSecret('S');
    assert.equal(fired, 4);

    subscription.dispose();
    await store.setParameter('b', '2');
    assert.equal(fired, 4);
});
