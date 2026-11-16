import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { Browser, Page, chromium } from 'playwright-core';
import { graphHtml } from '../../src/graphPage';
import { loadGraph, locateGraphFile, toMermaid } from '../../src/graph';

// Loads the real webview page outside VS Code: Mermaid is served from node_modules, and
// `acquireVsCodeApi` is stubbed to record what the page posts back to the extension.
// Uses an installed Chrome or Edge (override with PLAYWRIGHT_CHANNEL), so nothing is downloaded.
//
// Compiled to out-test/test/webview, so the repo root is three levels up.
const repoRoot = path.resolve(__dirname, '../../..');
const mermaidJs = fs.readFileSync(path.join(repoRoot, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'));
const ORIGIN = 'http://webview.test';
const NONCE = 'test-nonce';

const definition = toMermaid(loadGraph(locateGraphFile([path.join(repoRoot, 'test', 'fixtures', 'workspace')])!));

let browser: Browser;

before(async () => {
    const channels = process.env.PLAYWRIGHT_CHANNEL ? [process.env.PLAYWRIGHT_CHANNEL] : ['chrome', 'msedge'];
    const errors: string[] = [];
    for (const channel of channels) {
        try {
            browser = await chromium.launch({ channel });
            return;
        } catch (e) {
            errors.push(`${channel}: ${(e as Error).message.split('\n')[0]}`);
        }
    }
    throw new Error(`no browser to run the webview tests. Install Chrome or Edge, or set PLAYWRIGHT_CHANNEL.\n${errors.join('\n')}`);
});

after(async () => { await browser?.close(); });

/** Opens the page with the vscode API stubbed; returns it plus the messages it has posted. */
async function openPage(): Promise<{ page: Page; posted: () => Promise<{ type: string; target?: string }[]>; consoleErrors: string[] }> {
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    page.on('pageerror', e => consoleErrors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') { consoleErrors.push(m.text()); } });

    await page.addInitScript(() => {
        (window as any).__posted = [];
        (window as any).acquireVsCodeApi = () => ({ postMessage: (m: unknown) => (window as any).__posted.push(m) });
    });
    await page.route(`${ORIGIN}/**`, route => {
        const url = new URL(route.request().url());
        return url.pathname === '/mermaid.min.js'
            ? route.fulfill({ body: mermaidJs, contentType: 'text/javascript' })
            : route.fulfill({ body: graphHtml({ nonce: NONCE, cspSource: ORIGIN, mermaidUri: `${ORIGIN}/mermaid.min.js` }), contentType: 'text/html' });
    });
    await page.goto(`${ORIGIN}/`);
    return { page, posted: () => page.evaluate(() => (window as any).__posted), consoleErrors };
}

/** What the extension does: post a `graph` message to the page, then wait for the SVG. */
async function sendGraph(page: Page, def: string): Promise<void> {
    await page.evaluate(d => window.postMessage({ type: 'graph', definition: d }, '*'), def);
    await page.waitForSelector('#graph svg g.node');
}

test('posts ready on load, without console errors (CSP, Mermaid load)', async () => {
    const { page, posted, consoleErrors } = await openPage();
    try {
        assert.deepEqual(await posted(), [{ type: 'ready' }]);
        assert.deepEqual(consoleErrors, []);
    } finally {
        await page.close();
    }
});

test('a graph message renders one node per target', async () => {
    const { page } = await openPage();
    try {
        await sendGraph(page, definition);
        const labels = await page.locator('#graph g.node').allTextContents();
        assert.deepEqual(labels.map(l => l.trim()).sort(), ['Clean', 'Compile', 'Hidden', 'Pack', 'Restore']);
    } finally {
        await page.close();
    }
});

test('edges render solid (depends on), dashed (runs after) and thick (triggers)', async () => {
    const { page } = await openPage();
    try {
        await sendGraph(page, definition);
        const count = (selector: string) => page.locator(`#graph path.flowchart-link${selector}`).count();
        // Fixture: Restore runs after Clean (dashed); Compile depends on Restore (solid) and
        // triggers Pack (thick). Mermaid draws `-.->` with its "dotted" pattern class, and
        // repeats the solid classes on every edge, so solid means "not dotted, not thick".
        assert.equal(await count('.edge-pattern-dotted'), 1, 'dashed');
        assert.equal(await count('.edge-thickness-thick'), 1, 'thick');
        assert.equal(await count(':not(.edge-pattern-dotted):not(.edge-thickness-thick)'), 1, 'solid');
    } finally {
        await page.close();
    }
});

test('the default target is styled bold, unlisted targets are faded', async () => {
    const { page } = await openPage();
    try {
        await sendGraph(page, definition);
        const strokeWidth = (name: string) => page.locator('#graph g.node', { hasText: name }).locator('rect, polygon').first()
            .evaluate(el => getComputedStyle(el).strokeWidth);
        assert.equal(await strokeWidth('Compile'), '3px');
        assert.notEqual(await strokeWidth('Pack'), '3px');
        assert.equal(await page.locator('#graph g.node.unlisted').count(), 1);
    } finally {
        await page.close();
    }
});

test('clicking a target posts run with its name (not a fragment of the node id)', async () => {
    const { page, posted } = await openPage();
    try {
        await sendGraph(page, definition);
        await page.locator('#graph g.node', { hasText: 'Compile' }).click();
        const messages = await posted();
        assert.deepEqual(messages.at(-1), { type: 'run', target: 'Compile' });
    } finally {
        await page.close();
    }
});

test('a second graph message replaces the first', async () => {
    const { page } = await openPage();
    try {
        await sendGraph(page, definition);
        await page.evaluate(() => window.postMessage({ type: 'graph', definition: 'flowchart TD\n  Only["Only"]' }, '*'));
        await page.waitForFunction(() => document.querySelectorAll('#graph g.node').length === 1);
        assert.equal((await page.locator('#graph g.node').textContent())?.trim(), 'Only');
        assert.equal(await page.locator('#graph svg').count(), 1);
    } finally {
        await page.close();
    }
});
