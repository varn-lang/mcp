"use strict";

const fs = require("fs");
const path = require("path");
const { z } = require("zod");

function register(server, ctx) {
    server.registerTool(
        "vn_list_files",
        {
            title: "List Varn files",
            description:
                "List every .vn file under the workspace (or a subdirectory), the same files the editor's workspace symbol search sees.",
            inputSchema: {
                subdir: z.string().optional().describe("Subdirectory relative to the workspace root, e.g. 'std/task'.")
            }
        },
        async ({ subdir }) => {
            const root = subdir ? ctx.resolveInWorkspace(subdir) : ctx.workspaceRoot;
            const out = [];
            const walk = (dir) => {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (entry.name === "target" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) walk(full);
                    else if (entry.name.endsWith(".vn")) out.push(path.relative(ctx.workspaceRoot, full));
                }
            };
            walk(root);
            return ctx.text(out);
        }
    );

    server.registerTool(
        "vn_read_file",
        {
            title: "Read a Varn source file",
            description: "Read a .vn file's raw text, path relative to the workspace root.",
            inputSchema: { path: z.string() }
        },
        async ({ path: relPath }) => {
            const abs = ctx.resolveInWorkspace(relPath);
            return ctx.text(fs.readFileSync(abs, "utf8"));
        }
    );
}

module.exports = { register };
