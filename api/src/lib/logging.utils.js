'use strict';

import fs from 'fs';
import path from 'path';

const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

const LEVEL_METHODS = {
    error: ['error'],
    warn: ['warn'],
    info: ['info', 'log'],
    debug: ['debug'],
};

function normalizeLevel(level) {
    const normalized = String(level || '').toLowerCase();
    return LOG_LEVELS[normalized] !== undefined ? normalized : 'info';
}

export function configureConsoleLogging() {
    const selectedLevel = normalizeLevel(process.env.LOG_LEVEL);
    const threshold = LOG_LEVELS[selectedLevel];

    const original = {
        error: console.error.bind(console),
        warn: console.warn.bind(console),
        info: console.info.bind(console),
        log: console.log.bind(console),
        debug: console.debug.bind(console),
    };

    Object.entries(LEVEL_METHODS).forEach(([level, methods]) => {
        const enabled = LOG_LEVELS[level] <= threshold;
        methods.forEach((method) => {
            console[method] = (...args) => {
                if (enabled) {
                    original[method](...args);
                }
            };
        });
    });

    return selectedLevel;
}

export function shouldEnableHttpAccessLogs(activeLevel) {
    const explicit = process.env.MLE_HTTP_LOG_ENABLED;
    if (explicit !== undefined) {
        return String(explicit).toLowerCase() === 'true';
    }

    // Keep noisy request logs off by default for warn/error levels.
    return activeLevel === 'info' || activeLevel === 'debug';
}

/**
 * Remove sibling per-pod log directories with no file modified in `retentionDays`.
 * Pods get a fresh log directory on every rollout, so old ones otherwise accumulate forever.
 */
export async function pruneStaleLogDirs(logDir, retentionDays) {
    const days = Number(retentionDays);
    if (!logDir || !Number.isFinite(days) || days <= 0) return [];

    const parentDir = path.dirname(path.resolve(logDir));
    const currentDir = path.basename(path.resolve(logDir));
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const removed = [];

    const newestMtime = async (dir) => {
        let newest = (await fs.promises.stat(dir)).mtimeMs;
        for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
            const entryPath = path.join(dir, entry.name);
            const mtime = entry.isDirectory()
                ? await newestMtime(entryPath)
                : (await fs.promises.stat(entryPath)).mtimeMs;
            newest = Math.max(newest, mtime);
        }
        return newest;
    };

    let entries = [];
    try {
        entries = await fs.promises.readdir(parentDir, { withFileTypes: true });
    } catch (err) {
        console.warn(`[Logging] Could not scan ${parentDir} for stale log directories: ${err.message}`);
        return removed;
    }

    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === currentDir) continue;
        const dir = path.join(parentDir, entry.name);
        try {
            if (await newestMtime(dir) < cutoff) {
                await fs.promises.rm(dir, { recursive: true, force: true });
                removed.push(entry.name);
            }
        } catch (err) {
            console.warn(`[Logging] Failed to prune stale log directory ${dir}: ${err.message}`);
        }
    }

    if (removed.length) {
        console.info(`[Logging] Pruned ${removed.length} stale log director${removed.length === 1 ? 'y' : 'ies'} older than ${days}d in ${parentDir}`);
    }
    return removed;
}
