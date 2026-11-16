// The graph webview's page, as a pure function so it runs outside VS Code (webview tests).

export interface GraphPageOptions {
    /** CSP nonce for the inline script and the Mermaid bundle. */
    nonce: string;
    /** The webview's `cspSource`: the origin Mermaid is served from. */
    cspSource: string;
    /** URL of `mermaid.min.js`. */
    mermaidUri: string;
}

export function graphHtml({ nonce, cspSource, mermaidUri }: GraphPageOptions): string {
    // style-src 'unsafe-inline' is required: Mermaid injects its own <style> elements.
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; img-src ${cspSource} data:; script-src 'nonce-${nonce}' ${cspSource}; style-src ${cspSource} 'unsafe-inline';">
    <style>
        body { padding: 0.5em 1em; }
        #legend { font-size: 0.85em; opacity: 0.8; margin-bottom: 0.5em; }
        #graph .node { cursor: pointer; }
        #graph svg { max-width: 100%; height: auto; }
    </style>
</head>
<body>
    <div id="legend">
        solid &rarr; depends on &nbsp;&bull;&nbsp; dashed &rarr; runs after &nbsp;&bull;&nbsp;
        thick &rarr; triggers &nbsp;&bull;&nbsp; bold border = default target &nbsp;&bull;&nbsp;
        <b>click a target to run it</b>
    </div>
    <div id="graph"></div>
    <script nonce="${nonce}" src="${mermaidUri}"></script>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const container = document.getElementById('graph');
        const dark = document.body.classList.contains('vscode-dark')
                  || document.body.classList.contains('vscode-high-contrast');
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });

        let renderCount = 0;
        async function render(definition) {
            const { svg } = await mermaid.render('falloutGraph' + renderCount++, definition);
            container.innerHTML = svg;
            for (const node of container.querySelectorAll('g.node')) {
                node.addEventListener('click', () => {
                    // Mermaid node DOM ids look like "<renderId>-flowchart-<TargetName>-<n>"
                    // (older versions omit the render id); target names are C# identifiers,
                    // so they never contain dashes.
                    const match = /flowchart-([^-]+)-\\d+$/.exec(node.id);
                    const name = match && match[1];
                    if (name) {
                        vscode.postMessage({ type: 'run', target: name });
                    }
                });
            }
        }

        window.addEventListener('message', event => {
            if (event.data.type === 'graph') {
                render(event.data.definition);
            }
        });
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
}
