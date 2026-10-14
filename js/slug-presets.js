/**
 * slug-presets.ts
 * Derives sensible default tool settings from the page slug, e.g.
 * "compress-image-to-100kb" -> target 100KB, "resize-image-to-1920x1080" -> 1920x1080.
 */
export function targetBytesFromSlug(slug) {
    const kb = slug.match(/to-(\d+)kb/);
    if (kb)
        return parseInt(kb[1], 10) * 1024;
    const mb = slug.match(/to-(\d+)mb/);
    if (mb)
        return parseInt(mb[1], 10) * 1024 * 1024;
    return null;
}
export function dimsFromSlug(slug) {
    const m = slug.match(/(\d{2,5})x(\d{2,5})/);
    if (m)
        return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
    if (slug.includes("youtube-thumbnail"))
        return { width: 1280, height: 720 };
    if (slug.includes("linkedin-banner"))
        return { width: 1584, height: 396 };
    if (slug.includes("x-header"))
        return { width: 1500, height: 500 };
    return null;
}
export function instagramPresets() {
    return [
        { label: "Square post (1080×1080)", width: 1080, height: 1080 },
        { label: "Portrait post (1080×1350)", width: 1080, height: 1350 },
        { label: "Story / Reel (1080×1920)", width: 1080, height: 1920 },
    ];
}
export function cropAspectFromSlug(slug) {
    if (slug.includes("to-square"))
        return 1;
    if (slug.includes("16-9"))
        return 16 / 9;
    if (slug.includes("4-3"))
        return 4 / 3;
    if (slug.includes("profile-picture"))
        return 1;
    return null;
}
export function rotateAngleFromSlug(slug) {
    if (slug.includes("180"))
        return 180;
    if (slug.includes("90"))
        return 90;
    return 90;
}
export function rotateScopeFromSlug(slug) {
    if (slug.includes("landscape"))
        return "landscape";
    if (slug.includes("portrait"))
        return "portrait";
    return "all";
}
export function compressMimeFromSlug(slug) {
    if (slug.includes("png"))
        return "image/png";
    if (slug.includes("webp"))
        return "image/webp";
    if (slug.includes("gif"))
        return "image/gif";
    if (slug.includes("svg"))
        return "image/svg+xml";
    return "image/jpeg";
}
export function rotateMimeFromSlug(slug) {
    if (slug.includes("png"))
        return "image/png";
    if (slug.includes("webp"))
        return "image/webp";
    if (slug.includes("gif"))
        return "image/gif";
    return "image/jpeg";
}
export function resizeMimeFromSlug(slug) {
    if (slug.includes("png"))
        return "image/png";
    if (slug.includes("webp"))
        return "image/webp";
    if (slug.includes("gif"))
        return "image/gif";
    if (slug.includes("svg"))
        return "image/svg+xml";
    return "image/jpeg";
}
export function cropMimeFromSlug(slug) {
    if (slug.includes("png") || slug.includes("screenshot"))
        return "image/png";
    if (slug.includes("webp"))
        return "image/webp";
    if (slug.includes("gif"))
        return "image/gif";
    return "image/jpeg";
}
const INPUT_FORMATS = {
    jpg: { label: "JPG", mimes: ["image/jpeg", "image/jpg"], extensions: ["jpg", "jpeg", "jpe"] },
    jpeg: { label: "JPG", mimes: ["image/jpeg", "image/jpg"], extensions: ["jpg", "jpeg", "jpe"] },
    png: { label: "PNG", mimes: ["image/png"], extensions: ["png"] },
    webp: { label: "WEBP", mimes: ["image/webp"], extensions: ["webp"] },
    gif: { label: "GIF", mimes: ["image/gif"], extensions: ["gif"] },
    svg: { label: "SVG", mimes: ["image/svg+xml"], extensions: ["svg"] },
    bmp: { label: "BMP", mimes: ["image/bmp"], extensions: ["bmp"] },
    avif: { label: "AVIF", mimes: ["image/avif"], extensions: ["avif"] },
    heic: { label: "HEIC/HEIF", mimes: ["image/heic", "image/heif"], extensions: ["heic", "heif"] },
    tif: { label: "TIFF", mimes: ["image/tiff"], extensions: ["tif", "tiff"] },
    tiff: { label: "TIFF", mimes: ["image/tiff"], extensions: ["tif", "tiff"] },
    psd: { label: "PSD", mimes: ["image/vnd.adobe.photoshop", "image/x-photoshop"], extensions: ["psd"] },
    raw: {
        label: "RAW",
        mimes: [],
        extensions: ["raw", "cr2", "cr3", "nef", "arw", "sr2", "orf", "raf", "rw2", "dng", "pef"],
    },
    cr2: { label: "CR2", mimes: [], extensions: ["cr2"] },
    cr3: { label: "CR3", mimes: [], extensions: ["cr3"] },
    nef: { label: "NEF", mimes: [], extensions: ["nef"] },
    arw: { label: "ARW", mimes: [], extensions: ["arw"] },
    sr2: { label: "SR2", mimes: [], extensions: ["sr2"] },
    orf: { label: "ORF", mimes: [], extensions: ["orf"] },
    raf: { label: "RAF", mimes: [], extensions: ["raf"] },
    rw2: { label: "RW2", mimes: [], extensions: ["rw2"] },
    dng: { label: "DNG", mimes: [], extensions: ["dng"] },
    pef: { label: "PEF", mimes: [], extensions: ["pef"] },
};
export function inputFormatFromSlug(slug) {
    const operationFormat = slug.match(/^(?:compress|resize|crop|rotate|upscale|watermark)-([a-z0-9]+)$/)?.[1];
    const conversionSource = slug.match(/^([a-z0-9]+)-to-(?:image|jpg|png|webp|gif|avif)$/)?.[1];
    const token = operationFormat || conversionSource;
    const format = token ? INPUT_FORMATS[token] : undefined;
    if (!format)
        return null;
    return {
        ...format,
        accept: [...format.extensions.map((extension) => `.${extension}`), ...format.mimes].join(","),
    };
}
