"use client";
export async function decodeGif(file) {
    const { parseGIF, decompressFrames } = await import("gifuct-js");
    const buffer = await file.arrayBuffer();
    const parsed = parseGIF(buffer);
    const parsedFrames = decompressFrames(parsed, true);
    const width = parsed.lsd.width;
    const height = parsed.lsd.height;
    const full = document.createElement("canvas");
    full.width = width;
    full.height = height;
    const fullCtx = full.getContext("2d");
    const temp = document.createElement("canvas");
    const tempCtx = temp.getContext("2d");
    const frames = [];
    let previousSnapshot = null;
    for (const frame of parsedFrames) {
        const { dims } = frame;
        if (frame.disposalType === 3 && !previousSnapshot) {
            previousSnapshot = fullCtx.getImageData(0, 0, width, height);
        }
        else if (frame.disposalType === 3) {
            previousSnapshot = fullCtx.getImageData(0, 0, width, height);
        }
        temp.width = dims.width;
        temp.height = dims.height;
        const patchData = new ImageData(new Uint8ClampedArray(frame.patch), dims.width, dims.height);
        tempCtx.putImageData(patchData, 0, 0);
        fullCtx.drawImage(temp, dims.left, dims.top);
        frames.push({
            imageData: fullCtx.getImageData(0, 0, width, height),
            delay: Math.max(20, (frame.delay || 10) * 10),
        });
        if (frame.disposalType === 2) {
            fullCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
        }
        else if (frame.disposalType === 3 && previousSnapshot) {
            fullCtx.putImageData(previousSnapshot, 0, 0);
        }
    }
    return { width, height, frames };
}
/** Re-encodes a sequence of same-size ImageData frames into one animated GIF Blob. */
export async function encodeGif(frames, opts = {}) {
    const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
    const gif = GIFEncoder();
    const maxColors = opts.maxColors ?? 256;
    frames.forEach((frame, i) => {
        const data = frame.imageData.data;
        const palette = quantize(data, maxColors, { format: "rgba4444" });
        const index = applyPalette(data, palette, "rgba4444");
        gif.writeFrame(index, frame.imageData.width, frame.imageData.height, {
            palette,
            delay: frame.delay,
            repeat: opts.loop ?? 0,
            first: i === 0,
        });
    });
    gif.finish();
    const bytes = new Uint8Array(gif.bytes());
    return new Blob([bytes], { type: "image/gif" });
}
/** Applies a per-frame canvas transform (resize/crop/rotate/etc.) to every frame of a decoded GIF. */
export async function transformGifFrames(decoded, transform) {
    const out = [];
    for (const frame of decoded.frames) {
        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = decoded.width;
        srcCanvas.height = decoded.height;
        srcCanvas.getContext("2d").putImageData(frame.imageData, 0, 0);
        const outCanvas = transform(srcCanvas);
        const outCtx = outCanvas.getContext("2d");
        out.push({
            imageData: outCtx.getImageData(0, 0, outCanvas.width, outCanvas.height),
            delay: frame.delay,
        });
    }
    return out;
}
