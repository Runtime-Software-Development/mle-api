'use strict';

export function normalizeMIMEType(mimeType = '') {
    return String(mimeType)
        .split(';')[0]
        .trim()
        .toLowerCase();
}
