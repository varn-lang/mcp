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
        "varn_lsp_perf_log",
        {
            title: "LSP perf warnings",
            description:
                "Just the `[perf]` entries the server logged (slow index, slow hover/completion/etc) — what surfaced the workspace-indexing priority-queue bug during this session, without wading through the full raw trace.",
            inputSchema: {
                limit: z.number().int().optional().describe("How many recent [perf] entries to return (default 100).")
            }
        },
        async ({ limit }) => {
            const perfEntries = client
                .getTrace(4000)
                .filter((e) => e.text.includes("[perf]"))
                .map((e) => {
                    const match = e.text.match(/\[perf\]\s+(.*?)\s*\(?(\d+)ms\)?/);
                    return {
                        ts: e.ts,
                        raw: e.text.split("\n").find((l) => l.includes("[perf]")) || e.text,
                        op: match ? match[1] : undefined,
                        ms: match ? Number(match[2]) : undefined
                    };
                });
            const n = limit && limit > 0 ? limit : 100;
            return text(perfEntries.slice(-n));
        }
    );

    server.registerTool(
        "varn_memory_stats",
        {
            title: "Server memory stats",
            description:
                "What the running vn lsp process actually knows about its own memory: OS-reported resident set size (Task Manager's number, read from inside the process — Windows/Linux only), how many documents it has cached, and the size of the shared atom/type tables. No external tool needed.",
            inputSchema: {}
        },
        async () => text(await client.executeCommand("varn.memoryStats", []))
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
