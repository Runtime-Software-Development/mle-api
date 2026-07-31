'use strict';

import fs from 'fs';
import path from 'path';
import util from 'util';

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
        infoStream = fs.createWriteStream(path.join(logDir, logFile), { flags: 'a' });
        errorStream = fs.createWriteStream(path.join(logDir, errorLogFile), { flags: 'a' });
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
