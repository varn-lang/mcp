"use strict";

const fs = require("fs");
const path = require("path");

/** Mirrors varn-extension/src/binary.js's resolution order, standalone (no vscode API). */

function varnHomeBinPath(binName) {
    const home = process.env.VARN_HOME;
    if (!home) return undefined;
    return path.join(home, "bin", binName);
}

function findOnPath(executable) {
    const pathValue = process.env.PATH || process.env.Path || "";
    const sep = process.platform === "win32" ? ";" : ":";
    for (const dir of pathValue.split(sep)) {
        if (!dir) continue;
        const candidate = path.join(dir, executable);
        if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
}

/**
 * @param {string} workspaceRoot absolute path to the varn-lang checkout (or any
 *   workspace with its own target/ dir).
 */
function resolveCliPath(workspaceRoot) {
    const override = process.env.VARN_CLI_PATH;
    if (override && fs.existsSync(override)) return override;

    const binName = process.platform === "win32" ? "vn.exe" : "vn";
    const mode = process.env.VARN_BUILD_MODE === "release" ? "release" : "debug";
    const order = mode === "release" ? ["release", "debug"] : ["debug", "release"];

    const candidates = [];
    const homeBin = varnHomeBinPath(binName);
    if (homeBin) candidates.push(homeBin);

    for (const dir of order) {
        candidates.push(path.join(workspaceRoot, "target", dir, binName));
    }

    // varn-mcp is a sibling of varn-lang by convention; check it even if
    // workspaceRoot points somewhere else.
    const siblingRoot = path.resolve(workspaceRoot, "..", "varn-lang");
    if (siblingRoot !== workspaceRoot) {
        for (const dir of order) {
            candidates.push(path.join(siblingRoot, "target", dir, binName));
        }
    }

    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return findOnPath(binName);
}

/**
 * The executable that runs `vn lsp`: `vn-shadow` when it sits next to `vn`, so
 * the server runs from a private copy and rebuilding `vn` never hits a locked
 * exe. One-shot commands keep spawning `vn` directly: killing them on timeout
 * must kill the process that does the work.
 */
function resolveServerPath(cliPath) {
    const ext = process.platform === "win32" ? ".exe" : "";
    const shadow = path.join(path.dirname(cliPath), `vn-shadow${ext}`);
    return fs.existsSync(shadow) ? shadow : cliPath;
}

module.exports = { resolveCliPath, resolveServerPath };
