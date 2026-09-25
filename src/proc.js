"use strict";

const { spawn } = require("child_process");

/**
 * Run `binPath args...` to completion and capture everything — used for the
 * one-shot CLI subcommands (`run`, `check`, `bench`) that are NOT part of the
 * `vn lsp` JSON-RPC session, so they get their own short-lived process.
 *
 * A kill timeout guards against a script the user runs that blocks forever
 * (a REPL prompt, an infinite loop): better to return what was captured than
 * to hang the tool call.
 */
function runVn(binPath, args, cwd, timeoutMs = 30000) {
    return new Promise((resolve) => {
        const proc = spawn(binPath, args, { cwd });
        let stdout = "";
        let stderr = "";
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill();
        }, timeoutMs);

        proc.stdout.on("data", (d) => (stdout += d.toString()));
        proc.stderr.on("data", (d) => (stderr += d.toString()));
        proc.on("close", (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr, timedOut });
        });
        proc.on("error", (err) => {
            clearTimeout(timer);
            resolve({ code: null, stdout, stderr: `${stderr}\n${err.message}`, timedOut: false });
        });
    });
}

module.exports = { runVn };
