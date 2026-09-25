"use strict";

const { z } = require("zod");
const { resolveCliPath } = require("../binary");
const { runVn } = require("../proc");

function register(server, ctx) {
    const { resolveInWorkspace, text, workspaceRoot } = ctx;

    const cliPath = () => {
        const p = resolveCliPath(workspaceRoot);
        if (!p) throw new Error(`vn binary not found under ${workspaceRoot}.`);
        return p;
    };

    server.registerTool(
        "varn_run_file",
        {
            title: "Run file",
            description:
                "Actually runs `vn run <file>` and returns stdout/stderr/exit code — the same thing the editor's Run button does, not a static guess.",
            inputSchema: {
                path: z.string(),
                args: z.array(z.string()).optional().describe("Extra args passed after `--` to the program."),
                verbose: z.boolean().optional()
            }
        },
        async ({ path: relPath, args, verbose }) => {
            const abs = resolveInWorkspace(relPath);
            const cliArgs = [abs];
            if (verbose) cliArgs.push("--verbose");
            if (args && args.length > 0) cliArgs.push("--", ...args);
            const result = await runVn(cliPath(), cliArgs, workspaceRoot);
            return text(result);
        }
    );

    server.registerTool(
        "varn_check_file",
        {
            title: "Typecheck file",
            description: "Runs `vn check <file>` — a full compile with no execution, exit code and diagnostics text.",
            inputSchema: { path: z.string() }
        },
        async ({ path: relPath }) => {
            const abs = resolveInWorkspace(relPath);
            const result = await runVn(cliPath(), ["check", abs], workspaceRoot);
            return text(result);
        }
    );

    server.registerTool(
        "varn_bench_file",
        {
            title: "Benchmark file",
            description: "Runs `vn bench <file>` and returns the raw output — real numbers, not an estimate.",
            inputSchema: { path: z.string() }
        },
        async ({ path: relPath }) => {
            const abs = resolveInWorkspace(relPath);
            const result = await runVn(cliPath(), ["bench", abs], workspaceRoot, 120000);
            return text(result);
        }
    );
}

module.exports = { register };
