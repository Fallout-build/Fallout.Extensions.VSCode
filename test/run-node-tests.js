// Runs `node --test` over every *.test.js under a directory.
//
// Explicit file arguments behave the same on every Node version; directory and glob arguments
// to `--test` do not (Node 20 recurses into a directory, Node 22 treats it as a file, globs
// need 21+). CI runs on whatever Node the runner image ships, so don't depend on either.
//
// Usage: node test/run-node-tests.js <dir>   (e.g. out-test/test/unit)
const { readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

function testFiles(dir) {
    return readdirSync(dir).flatMap(name => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            return testFiles(full);
        }
        return name.endsWith('.test.js') ? [full] : [];
    });
}

const dir = process.argv[2];
if (!dir) {
    console.error('usage: node test/run-node-tests.js <dir>');
    process.exit(2);
}
const files = testFiles(dir);
if (files.length === 0) {
    console.error(`no *.test.js files under ${dir} (did the tests compile?)`);
    process.exit(1);
}
process.exit(spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' }).status ?? 1);
