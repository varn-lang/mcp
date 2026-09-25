"use strict";

const { z } = require("zod");

function register(server, ctx) {
    const { client, resolveInWorkspace, text } = ctx;

    server.registerTool(
        "varn_format_preview",
        {
            title: "Format preview",
            description:
                "The TextEdit[] the editor's formatter would apply — returned, never written to disk, so this is safe to call on anything.",
            inputSchema: { path: z.string() }
        },
        async ({ path: relPath }) => {
            const uri = await client.ensureOpen(resolveInWorkspace(relPath));
            const result = await client.request("textDocument/formatting", {
                textDocument: { uri },
                options: { tabSize: 4, insertSpaces: true }
            });
            return text(result);
        }
    );

    server.registerTool(
        "varn_rename_preview",
        {
            title: "Rename preview",
            description:
                "The WorkspaceEdit a rename at this position would produce — every file and range that would change, returned as data. Never applied: nothing gets written to disk.",
            inputSchema: {
                path: z.string(),
                line: z.number().int(),
                character: z.number().int(),
                newName: z.string()
            }
        },
        async ({ path: relPath, line, character, newName }) => {
            const uri = await client.ensureOpen(resolveInWorkspace(relPath));
            const result = await client.request("textDocument/rename", {
                textDocument: { uri },
                position: { line, character },
                newName
            });
            return text(result);
        }
    );
}

module.exports = { register };
