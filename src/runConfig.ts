import * as vscode from 'vscode';

/** A build parameter passed to a local run as `--name value`. */
export interface Parameter {
    name: string;
    value: string;
}

const PARAMS_KEY = 'fallout.parameters';

/**
 * Persists the local run configuration. Parameters live in workspace state — they are
 * per-workspace by nature (a configuration for *this* build), and plain enough to sit
 * in plugin storage. They are rendered as CLI args (`--name value`) for a local run.
 */
export class RunConfigStore {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(private readonly context: vscode.ExtensionContext) {}

    getParameters(): Parameter[] {
        return this.context.workspaceState.get<Parameter[]>(PARAMS_KEY, []);
    }

    async setParameter(name: string, value: string): Promise<void> {
        const params = this.getParameters().filter(p => p.name !== name);
        params.push({ name, value });
        params.sort((a, b) => a.name.localeCompare(b.name));
        await this.context.workspaceState.update(PARAMS_KEY, params);
        this.onDidChangeEmitter.fire();
    }

    async removeParameter(name: string): Promise<void> {
        await this.context.workspaceState.update(PARAMS_KEY, this.getParameters().filter(p => p.name !== name));
        this.onDidChangeEmitter.fire();
    }

    /** Parameters rendered as a CLI argument string, e.g. `--configuration Release`. */
    buildArgs(): string {
        return this.getParameters()
            .map(p => `--${p.name} ${quoteArg(p.value)}`)
            .join(' ');
    }
}

function quoteArg(value: string): string {
    return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/** The "Run Configuration" webview view — a form for build parameters. */
export class RunConfigViewProvider implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | undefined;

    constructor(
        private readonly store: RunConfigStore,
        disposables: vscode.Disposable[],
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
            }
        });
    }

    private postState(): void {
        void this.view?.webview.postMessage({
            type: 'state',
            parameters: this.store.getParameters(),
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
</style>
</head>
<body>
  <h4>Parameters</h4>
  <div class="hint">Passed to local runs as <code>--name value</code>.</div>
  <div id="params"></div>
  <div class="row">
    <input id="pName" class="name" placeholder="name" />
    <input id="pValue" placeholder="value" />
    <button id="pAdd">Add</button>
  </div>

<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();
  const el = id => document.getElementById(id);

  function render(state) {
    const params = el('params');
    params.innerHTML = '';
    for (const p of state.parameters) {
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('span'); name.className = 'name'; name.textContent = p.name;
      const val = document.createElement('input'); val.value = p.value;
      val.addEventListener('change', () => vscodeApi.postMessage({ type: 'setParameter', name: p.name, value: val.value }));
      const rm = document.createElement('button'); rm.className = 'icon'; rm.textContent = '✕';
      rm.addEventListener('click', () => vscodeApi.postMessage({ type: 'removeParameter', name: p.name }));
      row.append(name, val, rm);
      params.append(row);
    }
  }

  el('pAdd').addEventListener('click', () => {
    const name = el('pName').value.trim();
    if (!name) { return; }
    vscodeApi.postMessage({ type: 'setParameter', name, value: el('pValue').value });
    el('pName').value = ''; el('pValue').value = '';
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
