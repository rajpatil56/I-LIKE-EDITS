/**
 * image-engine.ts
 * 100% client-side image processing engine built on the Canvas API.
 * No file is ever uploaded anywhere — every operation below runs in the
 * user's own browser memory and produces a Blob the user can download.
 */
"use client";
export function formatBytes(bytes) {
    if (!bytes && bytes !== 0)
        return "–";
    if (bytes === 0)
        return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, i);
    return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
export function extFromMime(mime) {
    const map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif",
        "image/svg+xml": "svg",
        "image/bmp": "bmp",
    };
    return map[mime] || "jpg";
}
export function baseName(name) {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(0, dot) : name;
}
/** Identifies common image formats from their file signatures instead of trusting the filename. */
export async function detectImageMime(file) {
    const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
    const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
    const startsWith = (...signature) => signature.every((value, index) => bytes[index] === value);
    if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
        return "image/png";
    if (startsWith(0xff, 0xd8, 0xff))
        return "image/jpeg";
    if (["GIF87a", "GIF89a"].includes(ascii(0, 6)))
        return "image/gif";
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP")
        return "image/webp";
    if (ascii(0, 2) === "BM")
        return "image/bmp";
    if (startsWith(0x49, 0x49, 0x2a, 0x00) || startsWith(0x4d, 0x4d, 0x00, 0x2a))
        return "image/tiff";
    if (ascii(4, 4) === "ftyp") {
        const brands = [ascii(8, 4), ascii(16, 4), ascii(20, 4), ascii(24, 4)];
        if (brands.some((brand) => brand === "avif" || brand === "avis"))
            return "image/avif";
        if (brands.some((brand) => ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)))
            return "image/heic";
    }
    const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "").trimStart();
    if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(text))
        return "image/svg+xml";
    return null;
}
/** Formats a browser can never decode natively via <img>/createImageBitmap. */
const UNDECODABLE_EXT = new Set([
    "psd", "tif", "tiff", "raw", "cr2", "cr3", "nef", "arw", "sr2",
    "orf", "raf", "rw2", "dng", "pef",
]);
export function isLikelyUndecodable(file) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    return UNDECODABLE_EXT.has(ext);
}
export function isHeic(file) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    return ext === "heic" || ext === "heif" || file.type === "image/heic" || file.type === "image/heif";
}
/**
 * Normalizes any supported input file into a decodable Blob.
 * HEIC/HEIF photos are converted to JPEG first via heic2any (runs locally, WASM-free, pure JS).
 */
export async function normalizeToDecodable(file) {
    if (isHeic(file)) {
        const heic2any = (await import("heic2any")).default;
        const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
        return Array.isArray(out) ? out[0] : out;
    }
    return file;
}
/** Loads a File/Blob into an HTMLImageElement, resolving once pixel data is ready. */
export function loadImageElement(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("This file format can't be previewed directly in the browser."));
        };
        img.src = url;
    });
}
export function makeCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
}
export function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed."))), mime, quality);
    });
}
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function toResult(canvas, mime, quality) {
    const blob = await canvasToBlob(canvas, mime, quality);
    return { blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
}
/* ---------------------------- Compress ---------------------------- */
export async function compressImage(img, opts) {
    const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext("2d");
    if (opts.mime === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return toResult(canvas, opts.mime, opts.quality);
}
/** Iteratively lowers quality until the blob is at/under targetBytes (best effort, min quality 0.05). */
export async function compressToTargetSize(img, targetBytes, mime = "image/jpeg") {
    let quality = 0.92;
    let result = await compressImage(img, { quality, mime });
    let scale = 1;
    for (let i = 0; i < 12 && result.blob.size > targetBytes; i++) {
        if (quality > 0.12) {
            quality -= 0.1;
        }
        else {
            scale *= 0.85;
        }
        const canvas = makeCanvas(img.naturalWidth * scale, img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");
        if (mime === "image/jpeg") {
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        result = await toResult(canvas, mime, Math.max(quality, 0.05));
    }
    return result;
}
/* ----------------------------- Resize ------------------------------ */
export async function resizeImage(img, opts) {
    let w;
    let h;
    if (opts.percent) {
        w = img.naturalWidth * (opts.percent / 100);
        h = img.naturalHeight * (opts.percent / 100);
    }
    else {
        w = opts.width || img.naturalWidth;
        h = opts.height || img.naturalHeight;
    }
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (opts.mime === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return toResult(canvas, opts.mime, opts.quality ?? 0.92);
}
/* ------------------------------ Crop ------------------------------- */
export async function cropImage(img, box) {
    const canvas = makeCanvas(box.width, box.height);
    const ctx = canvas.getContext("2d");
    if (box.mime === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    return toResult(canvas, box.mime, box.quality ?? 0.92);
}
/* ----------------------------- Rotate ------------------------------ */
export async function rotateImage(img, opts) {
    const rad = (opts.angle * Math.PI) / 180;
    const swap = Math.abs(opts.angle % 180) === 90;
    const w = swap ? img.naturalHeight : img.naturalWidth;
    const h = swap ? img.naturalWidth : img.naturalHeight;
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (opts.mime === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.scale(opts.flipH ? -1 : 1, opts.flipV ? -1 : 1);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    return toResult(canvas, opts.mime, opts.quality ?? 0.92);
}
/* -------------------------- Format convert -------------------------- */
export async function convertFormat(img, opts) {
    const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext("2d");
    if (opts.mime === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    const result = await toResult(canvas, opts.mime, opts.quality ?? 0.92);
    return result;
}
/* ------------------------------ Upscale ------------------------------ */
/** Multi-step upscale: doubling repeatedly gives noticeably smoother results than one big jump. */
export async function upscaleImage(img, opts) {
    let curW = img.naturalWidth;
    let curH = img.naturalHeight;
    const targetW = img.naturalWidth * opts.scale;
    const targetH = img.naturalHeight * opts.scale;
    let srcCanvas = makeCanvas(curW, curH);
    srcCanvas.getContext("2d").drawImage(img, 0, 0);
    while (curW < targetW * 0.98) {
        const nextW = Math.min(targetW, curW * 2);
        const nextH = Math.min(targetH, curH * 2);
        const next = makeCanvas(nextW, nextH);
        const ctx = next.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(srcCanvas, 0, 0, nextW, nextH);
        srcCanvas = next;
        curW = nextW;
        curH = nextH;
    }
    if (opts.sharpen) {
        applyUnsharpMask(srcCanvas);
    }
    return toResult(srcCanvas, opts.mime, opts.quality ?? 0.92);
}
/** Lightweight sharpen convolution to counter the softness of upscaling. */
function applyUnsharpMask(canvas) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    if (width * height > 4_000_000)
        return; // skip on huge images to stay responsive
    const src = ctx.getImageData(0, 0, width, height);
    const dst = ctx.createImageData(width, height);
    const kernel = [0, -0.5, 0, -0.5, 3, -0.5, 0, -0.5, 0];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                let k = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const px = Math.min(width - 1, Math.max(0, x + kx));
                        const py = Math.min(height - 1, Math.max(0, y + ky));
                        sum += src.data[(py * width + px) * 4 + c] * kernel[k++];
                    }
                }
                dst.data[(y * width + x) * 4 + c] = Math.min(255, Math.max(0, sum));
            }
            dst.data[(y * width + x) * 4 + 3] = src.data[(y * width + x) * 4 + 3];
        }
    }
    ctx.putImageData(dst, 0, 0);
}
export async function watermarkImage(img, opts) {
    const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext("2d");
    if (opts.mime === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    ctx.globalAlpha = opts.opacity;
    const drawAt = (x, y, align, baseline) => {
        if (opts.logo) {
            const w = opts.fontSize * 3;
            const h = (opts.logo.naturalHeight / opts.logo.naturalWidth) * w;
            ctx.drawImage(opts.logo, x - (align === "center" ? w / 2 : align === "right" ? w : 0), y - (baseline === "middle" ? h / 2 : baseline === "bottom" ? h : 0), w, h);
        }
        else if (opts.text) {
            ctx.font = `700 ${opts.fontSize}px Inter, system-ui, sans-serif`;
            ctx.fillStyle = opts.color;
            ctx.textAlign = align;
            ctx.textBaseline = baseline;
            ctx.fillText(opts.text, x, y);
        }
    };
    const pad = Math.max(16, opts.fontSize * 0.6);
    const { width, height } = canvas;
    if (opts.position === "tile") {
        ctx.font = `700 ${opts.fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = opts.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const stepX = Math.max(140, opts.fontSize * 6);
        const stepY = Math.max(100, opts.fontSize * 4);
        ctx.save();
        for (let y = -stepY; y < height + stepY; y += stepY) {
            for (let x = -stepX; x < width + stepX; x += stepX) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(-Math.PI / 8);
                if (opts.text)
                    ctx.fillText(opts.text, 0, 0);
                ctx.restore();
            }
        }
        ctx.restore();
    }
    else {
        const [vPos, hPos] = opts.position.split("-");
        const x = hPos === "left" ? pad : hPos === "right" ? width - pad : width / 2;
        const y = vPos === "top" ? pad : vPos === "bottom" ? height - pad : height / 2;
        const align = hPos === "left" ? "left" : hPos === "right" ? "right" : "center";
        const baseline = vPos === "top" ? "top" : vPos === "bottom" ? "bottom" : "middle";
        drawAt(x, y, align, baseline);
    }
    ctx.globalAlpha = 1;
    return toResult(canvas, opts.mime, opts.quality ?? 0.92);
}
/* -------------------------------- Meme -------------------------------- */
export async function memeCaption(img, opts) {
    const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const fontSize = Math.max(12, Math.min(Math.round(canvas.width / 12), Math.round(canvas.height / 5)));
    const lineHeight = fontSize * 1.08;
    const pad = Math.max(8, fontSize * 0.3);
    ctx.font = `900 ${fontSize}px Impact, Arial Black, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = Math.max(2, fontSize / 14);
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#fff";
    const wrapCaption = (text, maxWidth) => {
        const lines = [];
        let line = "";
        for (const word of text.toUpperCase().trim().split(/\s+/).filter(Boolean)) {
            let remaining = word;
            while (remaining) {
                let part = remaining;
                while (part.length > 1 && ctx.measureText(line ? `${line} ${part}` : part).width > maxWidth) {
                    part = part.slice(0, -1);
                }
                const nextLine = line ? `${line} ${part}` : part;
                if (ctx.measureText(nextLine).width > maxWidth && line) {
                    lines.push(line);
                    line = "";
                    continue;
                }
                line = nextLine;
                remaining = remaining.slice(part.length);
                if (remaining) {
                    lines.push(line);
                    line = "";
                }
                else if (line.length < word.length) {
                    lines.push(line);
                    line = "";
                }
            }
        }
        if (line)
            lines.push(line);
        return lines;
    };
    const drawCaption = (text, position) => {
        if (!text.trim())
            return;
        const maxWidth = canvas.width * 0.92;
        const maxHeight = canvas.height * 0.4;
        const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
        const allLines = wrapCaption(text, maxWidth);
        const lines = allLines.slice(0, maxLines);
        if (!lines.length)
            return;
        if (allLines.length > maxLines) {
            const last = lines[maxLines - 1];
            lines[maxLines - 1] = `${last.replace(/[ .]+$/, "")}…`;
        }
        ctx.textBaseline = position === "top" ? "top" : "bottom";
        lines.forEach((line, i) => {
            const y = position === "top" ? pad + i * lineHeight : canvas.height - pad - (lines.length - 1 - i) * lineHeight;
            ctx.strokeText(line, canvas.width / 2, y, maxWidth);
            ctx.fillText(line, canvas.width / 2, y, maxWidth);
        });
    };
    drawCaption(opts.topText, "top");
    drawCaption(opts.bottomText, "bottom");
    return toResult(canvas, opts.mime, opts.quality ?? 0.95);
}
/** Builds a simple, standards-compliant PDF with one image per A4 page. */
export async function createImagesPdf(images) {
    if (images.length === 0)
        throw new Error("Add at least one image to create a PDF.");
    const encoder = new TextEncoder();
    const ascii = (value) => encoder.encode(value);
    const joinBytes = (parts) => {
        const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
        let offset = 0;
        for (const part of parts) {
            output.set(part, offset);
            offset += part.length;
        }
        return output;
    };
    const objects = [];
    const pageRefs = images.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
    objects.push(ascii("<< /Type /Catalog /Pages 2 0 R >>"));
    objects.push(ascii(`<< /Type /Pages /Kids [${pageRefs}] /Count ${images.length} >>`));
    for (let index = 0; index < images.length; index++) {
        const img = images[index];
        const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error("Your browser couldn't prepare an image for the PDF.");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.92);
        const imageBytes = new Uint8Array(await jpeg.arrayBuffer());
        const landscape = img.naturalWidth > img.naturalHeight;
        const pageWidth = landscape ? 841.89 : 595.28;
        const pageHeight = landscape ? 595.28 : 841.89;
        const margin = 24;
        const scale = Math.min((pageWidth - margin * 2) / img.naturalWidth, (pageHeight - margin * 2) / img.naturalHeight);
        const width = img.naturalWidth * scale;
        const height = img.naturalHeight * scale;
        const x = (pageWidth - width) / 2;
        const y = (pageHeight - height) / 2;
        const firstId = 3 + index * 3;
        const content = ascii(`q\n${width.toFixed(3)} 0 0 ${height.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm\n/Im0 Do\nQ\n`);
        objects.push(ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${firstId + 1} 0 R >> >> /Contents ${firstId + 2} 0 R >>`), joinBytes([
            ascii(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`),
            imageBytes,
            ascii("\nendstream"),
        ]), joinBytes([ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii("endstream")]));
    }
    const parts = [ascii("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
    const offsets = [0];
    let position = parts[0].length;
    objects.forEach((object, index) => {
        const entry = joinBytes([ascii(`${index + 1} 0 obj\n`), object, ascii("\nendobj\n")]);
        offsets.push(position);
        parts.push(entry);
        position += entry.length;
    });
    const xrefOffset = position;
    const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n"];
    for (const offset of offsets.slice(1))
        xref.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
    xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    parts.push(ascii(xref.join("")));
    const pdfBytes = joinBytes(parts);
    const pdfBuffer = new ArrayBuffer(pdfBytes.length);
    new Uint8Array(pdfBuffer).set(pdfBytes);
    return new Blob([pdfBuffer], { type: "application/pdf" });
}
export async function pixelateRegions(img, opts) {
    const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const blockSize = Math.max(4, Math.round(opts.strength));
    for (const region of opts.regions) {
        const { x, y, width, height } = normalizeRegion(region, canvas.width, canvas.height);
        if (width < 1 || height < 1)
            continue;
        const small = makeCanvas(Math.max(1, width / blockSize), Math.max(1, height / blockSize));
        const sctx = small.getContext("2d");
        sctx.imageSmoothingEnabled = true;
        sctx.drawImage(canvas, x, y, width, height, 0, 0, small.width, small.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, small.width, small.height, x, y, width, height);
    }
    return toResult(canvas, opts.mime, opts.quality ?? 0.92);
}
function normalizeRegion(r, canvasW, canvasH) {
    const x = Math.max(0, Math.min(r.x, canvasW));
    const y = Math.max(0, Math.min(r.y, canvasH));
    const width = Math.max(0, Math.min(r.width, canvasW - x));
    const height = Math.max(0, Math.min(r.height, canvasH - y));
    return { x, y, width, height };
}
export async function applyPhotoEdits(img, opts) {
    const canvas = makeCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext("2d");
    ctx.filter = opts.filter || "none";
    ctx.drawImage(img, 0, 0);
    ctx.filter = "none";
    if (opts.text?.value) {
        ctx.font = `700 ${opts.text.size}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = opts.text.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(opts.text.value, (opts.text.x / 100) * canvas.width, (opts.text.y / 100) * canvas.height);
    }
    if (opts.frame && opts.frame.width > 0) {
        ctx.strokeStyle = opts.frame.color;
        ctx.lineWidth = opts.frame.width * 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    }
    return toResult(canvas, opts.mime, opts.quality ?? 0.92);
}
/* ------------------------------ Remove background ------------------------------ */
/**
 * Runs a real segmentation model fully inside the browser (WebAssembly / WebGPU),
 * via @imgly/background-removal. The model files are fetched from a CDN on first
 * use and cached — your photo itself is never sent anywhere.
 */
export async function removeBackgroundClientSide(file, onProgress) {
    const { removeBackground } = await import("@imgly/background-removal");
    const blob = await removeBackground(file, {
        progress: onProgress,
        output: { format: "image/png", quality: 0.95 },
    });
    return blob;
}
/* ------------------------------ HTML to image ------------------------------ */
export async function htmlSnippetToImage(opts) {
    const html2canvas = (await import("html2canvas")).default;
    const holder = document.createElement("div");
    holder.style.position = "fixed";
    holder.style.left = "-99999px";
    holder.style.top = "0";
    holder.style.width = `${opts.width}px`;
    holder.style.background = "#ffffff";
    holder.innerHTML = opts.html;
    document.body.appendChild(holder);
    try {
        const canvas = await html2canvas(holder, { backgroundColor: "#ffffff", useCORS: true, scale: 2 });
        return await toResult(canvas, opts.mime, opts.quality ?? 0.95);
    }
    finally {
        holder.remove();
    }
}
