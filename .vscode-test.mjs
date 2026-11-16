import { defineConfig } from '@vscode/test-cli';

// Extension-host tests: launches a real VS Code on the fixture workspace.
// Compiled tests live in out-test/ (see tsconfig.test.json).
export default defineConfig({
    files: 'out-test/test/integration/**/*.test.js',
    workspaceFolder: './test/fixtures/workspace',
    launchArgs: ['--disable-extensions'],
    mocha: { ui: 'tdd', timeout: 30000 },
});
