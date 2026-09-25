"use strict";

const { z } = require("zod");

function register(server, ctx) {
    const { client, resolveInWorkspace, text } = ctx;

    server.registerTool(
        "varn_raw_request",
        {
            title: "Raw LSP request",
            description:
                "Send an arbitrary LSP method with raw params straight to `vn lsp` and return its raw response — for anything not covered by a dedicated tool, or to inspect the protocol directly.",
            inputSchema: {
                method: z.string().describe("LSP method name, e.g. 'textDocument/foldingRange'."),
                params: z.record(z.string(), z.unknown()).optional(),
                notification: z
                    .boolean()
                    .optional()
                    .describe("Send as a notification (no response expected) instead of a request.")
            }
        },
        async ({ method, params, notification }) => {
            if (notification) {
                await client.notify(method, params ?? {});
                return text({ sent: true, method, params });
            }
            const result = await client.request(method, params ?? {});
            return text(result);
        }
    );

    server.registerTool(
        "varn_lsp_log",
        {
            title: "Raw JSON-RPC log",
            description:
                "The raw wire trace between this MCP server and `vn lsp` — every request, response and notification, newest last. This is exactly what an editor's LSP output channel shows.",
            inputSchema: {
                limit: z.number().int().optional().describe("How many recent entries to return (default 200).")
            }
        },
        async ({ limit }) => text(client.getTrace(limit))
    );

    server.registerTool(
        "varn_server_status",
        {
            title: "Server status",
            description:
                "Whether the underlying `vn lsp` process is alive, which binary it is (path + mtime — confirms whether it's the freshly rebuilt one), pid, uptime, and which documents this session has open.",
            inputSchema: {}
        },
        async () => text(client.status())
    );

    server.registerTool(
        "varn_restart_server",
        {
            title: "Restart Language Server",
            description:
                "Tear down and relaunch `vn lsp` — the same effect as the editor's 'Varn: Restart Language Server' command. Call this after rebuilding vn to make sure you're not talking to a stale process.",
            inputSchema: {}
        },
        async () => {
            await client.restart();
            return text(client.status());
        }
    );

    server.registerTool(
        "varn_close_file",
        {
            title: "Close file",
            description: "Tell the server a file is no longer open, dropping its cached diagnostics on both sides.",
            inputSchema: { path: z.string() }
        },
        async ({ path: relPath }) => {
            const abs = resolveInWorkspace(relPath);
            await client.closeDocument(abs);
            return text({ closed: relPath });
        }
    );
}

module.exports = { register };
