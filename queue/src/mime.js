'use strict';

const imageMIMETypes = {
    bm: 'image/bmp',
    bmp: 'image/bmp',
    gif: 'image/gif',
    jpe: 'image/jpeg',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    iiq: 'image/x-phaseone-iiq',
    'x-png': 'image/png',
    '3fr': 'image/x-hasselblad-3fr',
    arw: 'image/x-sony-arw',
    cr2: 'image/x-canon-cr2',
    crw: 'image/x-canon-crw',
    dcr: 'image/x-kodak-dcr',
    dng: 'image/x-adobe-dng',
    erf: 'image/x-epson-erf',
    k25: 'image/x-kodak-k25',
    kdc: 'image/x-kodak-kdc',
    mrw: 'image/x-minolta-mrw',
    nef: 'image/x-nikon-nef',
    orf: 'image/x-olympus-orf',
    pef: 'image/x-pentax-pef',
    raf: 'image/raf',
    raf2: 'image/x-fuji-raf',
    raw: 'image/x-panasonic-raw',
    sr2: 'image/x-sony-sr2',
    srf: 'image/x-sony-srf',
    webp: 'image/webp',
    x3f: 'image/x-sigma-x3f',
    stream: 'application/octet-stream',
};

const supplementalMIMETypes = {
    pdf: 'application/pdf',
    rtf: 'application/rtf',
};

const IMAGE_PROCESS_TYPES = new Set(['historic_images', 'modern_images', 'supplemental_images']);

const allowedImageMIMEValues = new Set(
    Object.values(imageMIMETypes).map((value) => String(value).toLowerCase())
);

const allowedSupplementalMIMEValues = new Set(
    Object.values(supplementalMIMETypes).map((value) => String(value).toLowerCase())
);

export function normalizeMIMEType(mimeType = '') {
    return String(mimeType)
        .split(';')[0]
        .trim()
        .toLowerCase();
}

export function isAllowedMIMEType(mimeType) {
    const normalizedMIMEType = normalizeMIMEType(mimeType);
    return allowedImageMIMEValues.has(normalizedMIMEType)
        || allowedSupplementalMIMEValues.has(normalizedMIMEType);
}

export function isAllowedImageMIMEType(mimeType) {
    const normalizedMIMEType = normalizeMIMEType(mimeType);
    return allowedImageMIMEValues.has(normalizedMIMEType);
}

export function isImageProcessType(processType = '') {
    return IMAGE_PROCESS_TYPES.has(String(processType));
}
