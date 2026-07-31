'use strict';

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
