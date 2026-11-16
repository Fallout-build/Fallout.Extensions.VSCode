import * as vscode from 'vscode';
import { BuildGraph, toMermaid } from './model';
import { graphHtml } from './graphPage';

/** Singleton webview panel rendering the build graph with Mermaid. */
export class GraphPanel {
    private static current: GraphPanel | undefined;

    static createOrShow(extensionUri: vscode.Uri, graph: BuildGraph, onRunTarget: (target: string) => void): void {
        if (GraphPanel.current) {
            GraphPanel.current.panel.reveal();
            GraphPanel.current.update(graph);
            return;
        }
        const panel = vscode.window.createWebviewPanel('falloutGraph', 'Fallout Build Graph', vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'node_modules', 'mermaid', 'dist')],
        });
        GraphPanel.current = new GraphPanel(panel, extensionUri, graph, onRunTarget);
    }

    /** Pushes a new graph into the panel if it is open (no-op otherwise). */
    static refresh(graph: BuildGraph): void {
        GraphPanel.current?.update(graph);
    }

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private graph: BuildGraph,
        onRunTarget: (target: string) => void,
    ) {
        panel.webview.html = this.getHtml(extensionUri);
        panel.webview.onDidReceiveMessage((message: { type: string; target?: string }) => {
            if (message.type === 'ready') {
                this.update(this.graph);
            } else if (message.type === 'run' && message.target) {
                onRunTarget(message.target);
            }
        });
        panel.onDidDispose(() => {
            GraphPanel.current = undefined;
        });
    }

    private update(graph: BuildGraph): void {
        this.graph = graph;
        void this.panel.webview.postMessage({ type: 'graph', definition: toMermaid(graph) });
    }

    private getHtml(extensionUri: vscode.Uri): string {
        const webview = this.panel.webview;
        const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'));
        const nonce = getNonce();
        return graphHtml({ nonce, cspSource: webview.cspSource, mermaidUri: mermaidUri.toString() });
    }
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
