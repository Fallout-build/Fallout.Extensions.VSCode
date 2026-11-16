import * as vscode from 'vscode';
import { BuildDeclarations } from './model';

/** A build parameter passed to a local run as `--name value`. */
export interface Parameter {
    name: string;
    value: string;
}

const PARAMS_KEY = 'fallout.parameters';
const SECRET_NAMES_KEY = 'fallout.secretNames';
const SECRET_PREFIX = 'fallout.secret.';

/**
 * Persists the local run configuration: parameters live in workspace state (plain,
 * per-workspace); secret *values* live in VS Code's SecretStorage (OS keychain-backed)
 * and are never rendered into the webview — only their names are. Parameters become
 * CLI args (`--name value`); secrets become environment variables so they don't leak
 * into shell history or the process list.
 */
export class RunConfigStore {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(private readonly context: vscode.ExtensionContext) {}

    getParameters(): Parameter[] {
        return this.context.workspaceState.get<Parameter[]>(PARAMS_KEY, []);
    }

    /** Names compare ignoring case, like the framework's argument parser. A blank value clears the parameter. */
    async setParameter(name: string, value: string): Promise<void> {
        const key = name.trim().toLowerCase();
        const trimmed = value.trim();
        const params = this.getParameters().filter(p => p.name.toLowerCase() !== key);
        if (trimmed !== '') { params.push({ name: name.trim(), value: trimmed }); }
        params.sort((a, b) => a.name.localeCompare(b.name));
        await this.context.workspaceState.update(PARAMS_KEY, params);
        this.onDidChangeEmitter.fire();
    }

    async removeParameter(name: string): Promise<void> {
        const key = name.trim().toLowerCase();
        await this.context.workspaceState.update(PARAMS_KEY, this.getParameters().filter(p => p.name.toLowerCase() !== key));
        this.onDidChangeEmitter.fire();
    }

    getSecretNames(): string[] {
        return this.context.workspaceState.get<string[]>(SECRET_NAMES_KEY, []);
    }

    async setSecret(name: string, value: string): Promise<void> {
        await this.context.secrets.store(SECRET_PREFIX + name, value);
        if (!this.getSecretNames().includes(name)) {
            await this.context.workspaceState.update(SECRET_NAMES_KEY, [...this.getSecretNames(), name].sort());
        }
        this.onDidChangeEmitter.fire();
    }

    async removeSecret(name: string): Promise<void> {
        await this.context.secrets.delete(SECRET_PREFIX + name);
        await this.context.workspaceState.update(SECRET_NAMES_KEY, this.getSecretNames().filter(n => n !== name));
        this.onDidChangeEmitter.fire();
    }

    /** Parameters rendered as a CLI argument string, e.g. `--configuration Release`. */
    buildArgs(): string {
        return this.getParameters()
            .filter(p => p.value.trim() !== '')
            .map(p => `--${p.name} ${quoteArg(p.value)}`)
            .join(' ');
    }

    /** Resolves all stored secrets into an environment map for a local run. */
    async buildEnv(): Promise<Record<string, string>> {
        const env: Record<string, string> = {};
        for (const name of this.getSecretNames()) {
            const value = await this.context.secrets.get(SECRET_PREFIX + name);
            if (value !== undefined) {
                env[name] = value;
            }
        }
        return env;
    }
}

function quoteArg(value: string): string {
    return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/**
 * The "Run Configuration" webview view — a form for parameters and secrets. Members the build
 * declares are listed up front; free-form rows remain for anything else.
 */
export class RunConfigViewProvider implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | undefined;

    constructor(
        private readonly store: RunConfigStore,
        disposables: vscode.Disposable[],
        private readonly getDeclarations: () => BuildDeclarations,
    ) {
        disposables.push(this.store.onDidChange(() => this.postState()));
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.html(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message: any) => {
            switch (message?.type) {
                case 'ready':
                    this.postState();
                    break;
                case 'setParameter':
                    if (message.name) { await this.store.setParameter(String(message.name), String(message.value ?? '')); }
                    break;
                case 'removeParameter':
                    await this.store.removeParameter(String(message.name));
                    break;
                case 'setSecret':
                    if (message.name && message.value) { await this.store.setSecret(String(message.name), String(message.value)); }
                    break;
                case 'removeSecret':
                    await this.store.removeSecret(String(message.name));
                    break;
            }
        });
    }

    /** Re-reads what the build declares (called when the graph or schema file changes). */
    refreshDeclarations(): void {
        this.postState();
    }

    private postState(): void {
        void this.view?.webview.postMessage({
            type: 'state',
            parameters: this.store.getParameters(),
            secretNames: this.store.getSecretNames(),
            declared: this.getDeclarations(),
        });
    }

    private html(webview: vscode.Webview): string {
        const nonce = getNonce();
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); font-size: var(--vscode-font-size); padding: 0 4px; }
  h4 { margin: 12px 0 4px; text-transform: uppercase; font-size: 11px; opacity: 0.8; letter-spacing: 0.04em; }
  .row { display: flex; gap: 4px; margin-bottom: 4px; align-items: center; }
  input { flex: 1 1 auto; min-width: 0; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border, transparent); padding: 3px 6px; border-radius: 2px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none;
           padding: 3px 8px; border-radius: 2px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.icon { background: transparent; color: var(--vscode-foreground); padding: 3px 6px; }
  .name { flex: 0 0 40%; font-family: var(--vscode-editor-font-family); }
  .hint { opacity: 0.65; font-size: 11px; margin: 2px 0 8px; }
  .secret-val { font-family: var(--vscode-editor-font-family); opacity: 0.6; }
  .secret-val.unset { font-style: italic; }
  select { flex: 1 1 auto; min-width: 0; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground);
           border: 1px solid var(--vscode-dropdown-border, transparent); padding: 3px 6px; border-radius: 2px; }
</style>
</head>
<body>
  <div id="verbosityBlock" hidden>
    <h4>Verbosity</h4>
    <div class="row"><select id="verbosity"></select></div>
  </div>

  <h4>Parameters</h4>
  <div class="hint">Passed to local runs as <code>--name value</code>. Empty values are not passed.</div>
  <div id="declaredParams"></div>
  <div id="params"></div>
  <div class="row">
    <input id="pName" class="name" placeholder="name" />
    <input id="pValue" placeholder="value" />
    <button id="pAdd">Add</button>
  </div>

  <h4>Secrets</h4>
  <div class="hint">Stored in the OS keychain (SecretStorage); passed as environment variables. Values are never shown.</div>
  <div id="declaredSecrets"></div>
  <div id="secrets"></div>
  <div class="row">
    <input id="sName" class="name" placeholder="name" />
    <input id="sValue" type="password" placeholder="value" />
    <button id="sAdd">Set</button>
  </div>

<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();
  const el = id => document.getElementById(id);

  const VERBOSITY = 'verbosity';
  const send = msg => vscodeApi.postMessage(msg);
  const lower = s => s.toLowerCase();

  // An empty value clears the parameter instead of passing "--name ".
  function setOrClear(name, value) {
    value = value.trim();
    send(value === '' ? { type: 'removeParameter', name } : { type: 'setParameter', name, value });
  }

  // Fills a drop-down. A stored value the build no longer lists stays visible, marked unsupported,
  // because it is still passed to the build until the user changes it.
  function fillSelect(sel, values, current) {
    sel.innerHTML = '';
    const all = ['', ...values];
    if (current !== '' && !values.includes(current)) { all.push(current); }
    for (const v of all) {
      const o = document.createElement('option'); o.value = v;
      o.textContent = v === '' ? '(default)' : values.includes(v) || v === '' ? v : v + ' (unsupported)';
      sel.append(o);
    }
    sel.value = current;
  }

  function valueControl(decl, current) {
    if (decl.values && decl.values.length > 0) {
      const sel = document.createElement('select');
      fillSelect(sel, decl.values, current);
      sel.addEventListener('change', () => setOrClear(decl.name, sel.value));
      return sel;
    }
    const input = document.createElement('input'); input.value = current;
    input.addEventListener('change', () => setOrClear(decl.name, input.value));
    return input;
  }

  function render(state) {
    const declared = state.declared || { parameters: [], verbosityLevels: [] };
    const stored = new Map(state.parameters.map(p => [lower(p.name), p.value]));
    const declaredParams = declared.parameters.filter(p => !p.secret);
    const declaredSecrets = declared.parameters.filter(p => p.secret);
    const declaredNames = new Set(declared.parameters.map(p => lower(p.name)));

    // Verbosity: levels come from the build's schema, so 10.5's Information appears only on 10.5+.
    const hasVerbosity = declared.verbosityLevels.length > 0;
    el('verbosityBlock').hidden = !hasVerbosity;
    if (hasVerbosity) {
      const sel = el('verbosity');
      fillSelect(sel, declared.verbosityLevels, stored.get(VERBOSITY) ?? '');
      sel.onchange = () => setOrClear(VERBOSITY, sel.value);
    }

    const dp = el('declaredParams');
    dp.innerHTML = '';
    for (const d of declaredParams) {
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('span'); name.className = 'name'; name.textContent = d.name;
      if (d.description) { name.title = d.description; }
      row.append(name, valueControl(d, stored.get(lower(d.name)) ?? ''));
      dp.append(row);
    }

    // Free-form rows: stored parameters the build does not declare (verbosity has its own control).
    const params = el('params');
    params.innerHTML = '';
    for (const p of state.parameters) {
      if (declaredNames.has(lower(p.name)) || (hasVerbosity && lower(p.name) === VERBOSITY)) { continue; }
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('span'); name.className = 'name'; name.textContent = p.name;
      const val = document.createElement('input'); val.value = p.value;
      val.addEventListener('change', () => send({ type: 'setParameter', name: p.name, value: val.value }));
      const rm = document.createElement('button'); rm.className = 'icon'; rm.textContent = '✕';
      rm.addEventListener('click', () => send({ type: 'removeParameter', name: p.name }));
      row.append(name, val, rm);
      params.append(row);
    }

    // Declared secrets read "not set" until a value is stored; values never reach this page.
    const ds = el('declaredSecrets');
    ds.innerHTML = '';
    for (const d of declaredSecrets) {
      const isSet = state.secretNames.includes(d.name);
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('span'); name.className = 'name'; name.textContent = d.name;
      if (d.description) { name.title = d.description; }
      row.append(name);
      if (isSet) {
        const masked = document.createElement('span'); masked.className = 'secret-val'; masked.textContent = '••••••••';
        masked.style.flex = '1 1 auto';
        const rm = document.createElement('button'); rm.className = 'icon'; rm.textContent = '✕';
        rm.addEventListener('click', () => send({ type: 'removeSecret', name: d.name }));
        row.append(masked, rm);
      } else {
        const input = document.createElement('input'); input.type = 'password'; input.placeholder = 'not set';
        const set = document.createElement('button'); set.textContent = 'Set';
        set.addEventListener('click', () => { if (input.value) { send({ type: 'setSecret', name: d.name, value: input.value }); } });
        row.append(input, set);
      }
      ds.append(row);
    }

    const secrets = el('secrets');
    secrets.innerHTML = '';
    for (const name of state.secretNames) {
      if (declaredSecrets.some(d => d.name === name)) { continue; }
      const row = document.createElement('div');
      row.className = 'row';
      const n = document.createElement('span'); n.className = 'name'; n.textContent = name;
      const masked = document.createElement('span'); masked.className = 'secret-val'; masked.textContent = '••••••••';
      const rm = document.createElement('button'); rm.className = 'icon'; rm.textContent = '✕';
      rm.addEventListener('click', () => send({ type: 'removeSecret', name }));
      row.append(n, masked, rm);
      secrets.append(row);
    }
  }

  el('pAdd').addEventListener('click', () => {
    const name = el('pName').value.trim();
    if (!name) { return; }
    vscodeApi.postMessage({ type: 'setParameter', name, value: el('pValue').value });
    el('pName').value = ''; el('pValue').value = '';
  });
  el('sAdd').addEventListener('click', () => {
    const name = el('sName').value.trim();
    const value = el('sValue').value;
    if (!name || !value) { return; }
    vscodeApi.postMessage({ type: 'setSecret', name, value });
    el('sName').value = ''; el('sValue').value = '';
  });

  window.addEventListener('message', e => { if (e.data?.type === 'state') { render(e.data); } });
  vscodeApi.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
