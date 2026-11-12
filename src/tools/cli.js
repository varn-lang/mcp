"use strict";

const { z } = require("zod");
const { resolveCliPath } = require("../binary");
const { runVn } = require("../proc");

/**
 * The rest of `vn` — test runner, formatter, package manager, cache, doctor,
 * build, eval, and the `debug -p` inspection instrument. vn_run_file /
 * vn_check_file / vn_bench_file (execution.js) came first because they
 * were the obvious ones; this module is everything else the CLI can do, so
 * this MCP server covers Varn as a whole, not just what the LSP answers.
 */
function register(server, ctx) {
    const { resolveInWorkspace, text, workspaceRoot } = ctx;

    const cliPath = () => {
        const p = resolveCliPath(workspaceRoot);
        if (!p) throw new Error(`vn binary not found under ${workspaceRoot}.`);
        return p;
    };

    server.registerTool(
        "vn_test",
        {
            title: "Run test suite",
            description:
                "Runs `vn test [path]` — the real test runner, not a guess from reading source. Defaults to ./tests.",
            inputSchema: {
                path: z.string().optional().describe("Target file, directory, or pattern; default './tests'."),
                filter: z.string().optional().describe("Filter test/file names matching this pattern."),
                jobs: z.number().int().optional().describe("Parallel isolates/worker threads."),
                failFast: z.boolean().optional(),
                verbose: z.boolean().optional()
            }
        },
        async ({ path: relPath, filter, jobs, failFast, verbose }) => {
            const args = ["test"];
            if (filter) args.push("--filter", filter);
            if (jobs) args.push("--jobs", String(jobs));
            if (failFast) args.push("--fail-fast");
            if (verbose) args.push("--verbose");
            if (relPath) args.push(resolveInWorkspace(relPath));
            const result = await runVn(cliPath(), args, workspaceRoot, 180000);
            return text(result);
        }
    );

    server.registerTool(
        "vn_fmt",
        {
            title: "Format",
            description:
                "Runs `vn fmt [path]`. Defaults to --check (reports what's unformatted, changes nothing); pass write:true to actually reformat files on disk.",
            inputSchema: {
                path: z.string().optional().describe("File or directory; default is the workspace root."),
                write: z.boolean().optional().describe("Actually reformat files instead of just checking."),
                verbose: z.boolean().optional()
            }
        },
        async ({ path: relPath, write, verbose }) => {
            const args = ["fmt"];
            if (!write) args.push("--check");
            if (verbose) args.push("--verbose");
            if (relPath) args.push(resolveInWorkspace(relPath));
            const result = await runVn(cliPath(), args, workspaceRoot, 60000);
            return text(result);
        }
    );

    server.registerTool(
        "vn_pkg",
        {
            title: "Package manager",
            description:
                "Runs `vn pkg <subcommand> [args...]` — add/remove/install/update/tree/doctor/clean, exactly as the CLI defines them.",
            inputSchema: {
                subcommand: z.enum(["add", "remove", "install", "update", "tree", "doctor", "clean"]),
                args: z.array(z.string()).optional()
            }
        },
        async ({ subcommand, args }) => {
            const result = await runVn(cliPath(), ["pkg", subcommand, ...(args || [])], workspaceRoot, 120000);
            return text(result);
        }
    );

    server.registerTool(
        "vn_cache_clean",
        {
            title: "Clean cache",
            description: "Runs `vn cache clean` — clears ~/.varn/cache. Use before a check if a result looks stale/suspicious.",
            inputSchema: {}
        },
        async () => text(await runVn(cliPath(), ["cache", "clean"], workspaceRoot))
    );

    server.registerTool(
        "vn_doctor",
        {
            title: "Doctor",
            description: "Runs `vn doctor` — environment sanity check (VN_HOME, std resolution, toolchain).",
            inputSchema: {}
        },
        async () => text(await runVn(cliPath(), ["doctor"], workspaceRoot))
    );

    server.registerTool(
        "vn_build",
        {
            title: "Build",
            description: "Runs `vn build <file>` — compiles to bytecode (default) or, with native:true, AOT to a native executable.",
            inputSchema: {
                path: z.string(),
                output: z.string().optional().describe("Output path, relative to the workspace root."),
                target: z.string().optional().describe("Compile target; default 'bytecode'."),
                native: z.boolean().optional().describe("Compile to a native executable (AOT) instead."),
                verbose: z.boolean().optional()
            }
        },
        async ({ path: relPath, output, target, native, verbose }) => {
            const args = ["build", resolveInWorkspace(relPath)];
            if (output) args.push("-o", resolveInWorkspace(output));
            if (target) args.push("--target", target);
            if (native) args.push("--native");
            if (verbose) args.push("--verbose");
            const result = await runVn(cliPath(), args, workspaceRoot, 120000);
            return text(result);
        }
    );

    server.registerTool(
        "vn_eval",
        {
            title: "Eval",
            description: "Runs `vn eval <code>` — a one-off snippet, no file needed.",
            inputSchema: { code: z.string(), verbose: z.boolean().optional() }
        },
        async ({ code, verbose }) => {
            const args = ["eval", code];
            if (verbose) args.push("--verbose");
            const result = await runVn(cliPath(), args, workspaceRoot, 30000);
            return text(result);
        }
    );

    server.registerTool(
        "vn_debug_inspect",
        {
            title: "Debug instrument (vn debug -p)",
            description:
                "The compiler's own audit instrument — the same one used to chase JIT tiering, typeloss, GC roots and CLIF lowering bugs. Phases: tokens, ast, modules, symbols, check:types, bytecode, scope, caps, graph, summary, typeloss, tir, tiers, bails, roots, clif (+ clif:route/kinds/ir/asm/check/all), gc, roots:diff/summary/all, lsp:hovers/semantic/types/completions/symbols/colorize/hints/all, check, all. Call with no phase for the phase list.",
            inputSchema: {
                path: z.string().optional().describe("File to inspect; omit to get the phase list."),
                phase: z.string().optional().describe("e.g. 'bails', 'clif:ir', 'typeloss', 'tir:check'. Default 'all'."),
                fn: z.string().optional().describe("Only dump functions whose name contains this."),
                eval: z.string().optional().describe("Inspect an inline snippet instead of a file.")
            }
        },
        async ({ path: relPath, phase, fn, eval: code }) => {
            if (!relPath && !code) {
                const result = await runVn(cliPath(), ["debug", "--list-phases"], workspaceRoot);
                return text(result);
            }
            const args = ["debug"];
            if (phase) args.push("-p", phase);
            if (fn) args.push("--fn", fn);
            if (code) args.push("-e", code);
            else args.push(resolveInWorkspace(relPath));
            const result = await runVn(cliPath(), args, workspaceRoot, 60000);
            return text(result);
        }
    );
}

module.exports = { register };
