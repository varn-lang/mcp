"use strict";

const path = require("path");
const { z } = require("zod");
const { fromUri } = require("../lsp-client");

function register(server, ctx) {
    const { client, resolveInWorkspace, text, workspaceRoot } = ctx;

    server.registerTool(
        "varn_diagnostics",
        {
            title: "Diagnostics",
            description:
                "The last diagnostics batch the server published for this file — errors/warnings, as the editor's Problems panel would show.",
            inputSchema: { path: z.string() }
        },
        async ({ path: relPath }) => {
            const abs = resolveInWorkspace(relPath);
            await client.ensureOpen(abs);
            return text(await client.waitForDiagnostics(abs));
        }
    );

    server.registerTool(
        "varn_workspace_diagnostics",
        {
            title: "All open diagnostics",
            description:
                "Diagnostics for every file the server has published diagnostics for so far this session — a workspace-wide Problems panel, not just one file's.",
            inputSchema: {}
        },
        async () => {
            const out = {};
            for (const [uri, diags] of client.diagnostics.entries()) {
                if (diags.length === 0) continue;
                const rel = path.relative(workspaceRoot, fromUri(uri));
                out[rel] = diags;
            }
            return text(out);
        }
    );

    server.registerTool(
        "varn_code_actions",
        {
            title: "Code actions",
            description: "Quick fixes / refactors available for a range — what the editor's lightbulb menu offers.",
            inputSchema: {
                path: z.string(),
                startLine: z.number().int(),
                startCharacter: z.number().int(),
                endLine: z.number().int(),
                endCharacter: z.number().int()
            }
        },
        async ({ path: relPath, startLine, startCharacter, endLine, endCharacter }) => {
            const abs = resolveInWorkspace(relPath);
            const uri = await client.ensureOpen(abs);
            const range = {
                start: { line: startLine, character: startCharacter },
                end: { line: endLine, character: endCharacter }
            };
            const result = await client.request("textDocument/codeAction", {
                textDocument: { uri },
                range,
                context: { diagnostics: client.getDiagnostics(abs) }
            });
            return text(result);
        }
    );
}

module.exports = { register };
