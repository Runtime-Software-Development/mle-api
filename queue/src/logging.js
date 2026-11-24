'use strict';

import fs from 'fs';
import path from 'path';
import util from 'util';
import { createStream } from 'rotating-file-stream';

const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

const METHOD_TO_LEVEL = {
    error: 'error',
    warn: 'warn',
    info: 'info',
    log: 'info',
    debug: 'debug',
};

function normalizeLevel(level) {
    const normalized = String(level || '').toLowerCase();
    return LOG_LEVELS[normalized] !== undefined ? normalized : 'info';
}

function formatLine(level, args) {
    const timestamp = new Date().toISOString();
    const rendered = args.map((arg) => {
        if (typeof arg === 'string') {
            return arg;
        }

        return util.inspect(arg, {
            depth: 5,
            colors: false,
            breakLength: 120,
            compact: true,
        });
    }).join(' ');

    return `[${timestamp}] [${level.toUpperCase()}] ${rendered}`;
}

// Same rotation policy as the API: rotate weekly or at 10MB, gzip, keep 10 files.
export function createRotatingLogStream(logDir, fileName, writeFallback) {
    const stream = createStream(fileName, {
        interval: '7d',
        path: logDir,
        compress: 'gzip',
        maxFiles: 10,
        size: '10M',
    });
    let healthy = true;
    // Without an error listener, NFS write failures would crash the process.
    stream.on('error', (err) => {
        healthy = false;
        writeFallback?.(`[Logging] ${fileName} stream disabled due to write error: ${err?.message || err}\n`);
    });
    return {
        write(line) {
            if (healthy) stream.write(line);
        },
        end() {
            stream.end();
        },
    };
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

export function configureQueueLogging() {
    const activeLevel = normalizeLevel(process.env.LOG_LEVEL);
    const threshold = LOG_LEVELS[activeLevel];

    const logToFile = String(process.env.MLE_LOG_TO_FILE || 'true').toLowerCase() === 'true';
    const logDir = process.env.MLE_LOG_DIR || '/usr/src/app/logs';
    const logFile = process.env.MLE_QUEUE_LOG_FILE || 'queue.log';
    const errorLogFile = process.env.MLE_QUEUE_ERROR_LOG_FILE || 'queue-error.log';

    const original = {
        error: console.error.bind(console),
        warn: console.warn.bind(console),
        info: console.info.bind(console),
        log: console.log.bind(console),
        debug: console.debug.bind(console),
    };

    let infoStream = null;
    let errorStream = null;

    if (logToFile) {
        fs.mkdirSync(logDir, { recursive: true });
        infoStream = createRotatingLogStream(logDir, logFile, (msg) => process.stderr.write(msg));
        errorStream = createRotatingLogStream(logDir, errorLogFile, (msg) => process.stderr.write(msg));
    }

    Object.entries(METHOD_TO_LEVEL).forEach(([method, level]) => {
        console[method] = (...args) => {
            if (LOG_LEVELS[level] > threshold) {
                return;
            }

            original[method](...args);

            if (!logToFile) {
                return;
            }

            const line = `${formatLine(level, args)}\n`;
            if (level === 'error') {
                errorStream?.write(line);
                return;
            }

            infoStream?.write(line);
        };
    });

    process.on('beforeExit', () => {
        infoStream?.end();
        errorStream?.end();
    });

    return activeLevel;
}
