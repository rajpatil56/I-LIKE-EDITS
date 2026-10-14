import * as Engine from "./image-engine.js";
import * as Gif from "./gif-engine.js";
import * as Presets from "./slug-presets.js";

const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
const workspace = document.querySelector("#tool-workspace");
const slug = document.body.dataset.slug;
const group = workspace?.dataset.group;
const state = {
  items: [], activeId: null, busy: false, message: null, pdfResult: null, htmlResult: null, bgProgress: "",
  quality: 0.82, targetBytes: Presets.targetBytesFromSlug(slug), resizeMode: "px", resizePercent: 50,
  width: Presets.dimsFromSlug(slug)?.width || 0, height: Presets.dimsFromSlug(slug)?.height || 0,
  lockAspect: false, cropAspect: Presets.cropAspectFromSlug(slug), cropBoxes: [{ x: 0, y: 0, w: 100, h: 100 }],
  angle: Presets.rotateAngleFromSlug(slug), flipH: false, flipV: false, fromJpgTarget: slug.includes("gif") ? "image/gif" : "image/png",
  gifFrameDelay: 500, wmText: "Your Brand", wmFontSize: 42, wmColor: "#ffffff", wmOpacity: 0.65,
  wmPosition: "bottom-right", wmLogoFile: null, memeTop: "TOP TEXT", memeBottom: "BOTTOM TEXT",
  blurBoxes: [], blurStrength: 18, editorFilter: "none", editorText: "", editorFrameWidth: 0,
  editorFrameColor: "#111111", upscaleFactor: 2, htmlSource: `<div style="font-family:sans-serif;padding:40px;background:#fff">\n  <h1 style="color:#3a5bff">Hello world</h1>\n  <p>Paste any HTML here and capture the page.</p>\n</div>`, htmlWidth: 900,
};
let siteData;

const formatMime = {
  compress: Presets.compressMimeFromSlug(slug), resize: Presets.resizeMimeFromSlug(slug),
  crop: Presets.cropMimeFromSlug(slug), rotate: Presets.rotateMimeFromSlug(slug),
  convert: group === "convert-png" ? "image/png" : group === "convert-webp" ? "image/webp" : group === "convert-avif" ? "image/avif" : group === "convert-gif" ? "image/gif" : "image/jpeg",
};
const inputFormat = Presets.inputFormatFromSlug(slug);
const fileAccept = inputFormat?.accept || "image/*,.heic,.heif,.raw,.cr2,.cr3,.nef,.arw,.sr2,.orf,.raf,.rw2,.dng,.pef,.psd,.tif,.tiff";
const activeItem = () => state.items.find((item) => item.id === state.activeId) || state.items[0] || null;
const range = (label, name, value, min, max, step = 1, display = value) => `<div class="field"><label>${label}<span data-value="${name}">${display}</span></label><input data-setting="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
const field = (label, name, value, type = "text", extra = "") => `<div class="field"><label>${label}</label><input data-setting="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
const button = (label, action, active = false, value = "") => `<button type="button" data-action="${action}" data-value="${esc(value)}" class="${active ? "active" : ""}">${label}</button>`;
const segmented = (buttons) => `<div class="segmented">${buttons.join("")}</div>`;

function controlsHtml() {
  if (group === "html-to-image") return `<div class="field"><label>HTML snippet</label><textarea data-setting="htmlSource" rows="10">${esc(state.htmlSource)}</textarea></div>${range("Render width (px)", "htmlWidth", state.htmlWidth, 320, 1600, 1, state.htmlWidth)}<p class="hint">Paste HTML markup to capture. External URLs cannot be captured from the browser without a server.</p>`;
  if (group === "compress") return `<div class="field"><label>Output format</label><select disabled><option>${formatMime.compress.split("/")[1].toUpperCase()}</option></select></div><div class="field"><label>Target file size<span>${state.targetBytes ? Engine.formatBytes(state.targetBytes) : "Off"}</span></label>${segmented([null, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000].map((size) => button(size ? Engine.formatBytes(size) : "Manual", "target", state.targetBytes === size, size ?? "off")))}</div>${state.targetBytes ? "" : range("Quality", "quality", state.quality, 0.05, 1, 0.01, `${Math.round(state.quality * 100)}%`)}`;
  if (group === "resize") return `${segmented([button("Pixels", "resize-mode", state.resizeMode === "px", "px"), button("Percentage", "resize-mode", state.resizeMode === "%", "%")])}${state.resizeMode === "px" ? `<div class="field-row">${field("Width (px)", "width", state.width, "number", "min=1")}${field("Height (px)", "height", state.height, "number", "min=1")}</div>` : range("Scale", "resizePercent", state.resizePercent, 5, 300, 1, `${state.resizePercent}%`)}<label class="toggle-row"><input data-setting="lockAspect" type="checkbox" ${state.lockAspect ? "checked" : ""}>Lock aspect ratio</label>${slug.includes("instagram") ? segmented(Presets.instagramPresets().map((preset) => button(preset.label, "instagram", false, `${preset.width}x${preset.height}`))) : ""}`;
  if (group === "crop") return `<div class="field"><label>Aspect ratio</label>${segmented([{ label: "Free", value: "free" }, { label: "1:1", value: "1" }, { label: "16:9", value: String(16 / 9) }, { label: "4:3", value: String(4 / 3) }].map((option) => button(option.label, "crop-aspect", String(state.cropAspect ?? "free") === option.value, option.value)))}</div><p class="hint">Drag on the preview to select the area to keep, or enter exact percentages below.</p><div class="field-row">${field("X %", "cropX", Math.round(state.cropBoxes[0]?.x ?? 0), "number", "min=0 max=100")}${field("Y %", "cropY", Math.round(state.cropBoxes[0]?.y ?? 0), "number", "min=0 max=100")}</div><div class="field-row">${field("Width %", "cropW", Math.round(state.cropBoxes[0]?.w ?? 100), "number", "min=1 max=100")}${field("Height %", "cropH", Math.round(state.cropBoxes[0]?.h ?? 100), "number", "min=1 max=100")}</div>`;
  if (group === "rotate") return `${range("Angle", "angle", state.angle, -180, 180, 1, `${state.angle}°`)}${segmented([90, 180, 270, -90].map((angle) => button(`${angle}°`, "angle", state.angle === angle, angle)))}<label class="toggle-row"><input data-setting="flipH" type="checkbox" ${state.flipH ? "checked" : ""}>Flip horizontal</label><label class="toggle-row"><input data-setting="flipV" type="checkbox" ${state.flipV ? "checked" : ""}>Flip vertical</label>`;
  if (group.startsWith("convert-")) return `<div class="field"><label>Target format</label>${group === "convert-from-jpg" ? `<select data-setting="fromJpgTarget"><option value="image/png" ${state.fromJpgTarget === "image/png" ? "selected" : ""}>PNG</option><option value="image/gif" ${state.fromJpgTarget === "image/gif" ? "selected" : ""}>Animated GIF (uses all loaded images)</option></select>` : `<select disabled><option>${formatMime.convert.split("/")[1].toUpperCase()}</option></select>`}</div>${["image/jpeg", "image/webp", "image/avif"].includes(formatMime.convert) ? range("Quality", "quality", state.quality, 0.1, 1, 0.01, `${Math.round(state.quality * 100)}%`) : ""}${(group === "convert-gif" || state.fromJpgTarget === "image/gif") ? `${field("Frame delay (ms)", "gifFrameDelay", state.gifFrameDelay, "number", "min=50 step=50")}<p class="hint">Upload multiple images; each becomes a frame in the animated GIF.</p>` : ""}`;
  if (group === "watermark") return `${field("Watermark text", "wmText", state.wmText)}<div class="field"><label>Or use a logo image instead</label><input data-setting="wmLogoFile" type="file" accept="image/*"></div><div class="field-row">${range("Size", "wmFontSize", state.wmFontSize, 14, 120)}<div class="field"><label>Color</label><input data-setting="wmColor" type="color" value="${state.wmColor}"></div></div>${range("Opacity", "wmOpacity", state.wmOpacity, 0.05, 1, 0.05, `${Math.round(state.wmOpacity * 100)}%`)}<div class="field"><label>Position</label><div class="grid3x3">${["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"].map((position) => `<button type="button" title="${position}" data-action="wm-position" data-value="${position}" class="${state.wmPosition === position ? "active" : ""}"></button>`).join("")}</div><button type="button" class="btn btn-sm btn-secondary" data-action="wm-position" data-value="tile">Tile across image</button></div>`;
  if (group === "meme") return `${field("Top text", "memeTop", state.memeTop)}${field("Bottom text", "memeBottom", state.memeBottom)}`;
  if (group === "blur-face") return `<p class="hint">Drag on the preview to draw boxes over areas you want to hide.</p>${range("Pixelation strength", "blurStrength", state.blurStrength, 6, 40)}${state.blurBoxes.length ? `<button class="btn btn-ghost btn-sm" data-action="clear-blur">Clear boxes (${state.blurBoxes.length})</button>` : ""}`;
  if (group === "photo-editor") return `<div class="field"><label>Filter</label><select data-setting="editorFilter">${[["none", "None"], ["grayscale(1)", "Grayscale"], ["sepia(0.7)", "Sepia"], ["saturate(1.6) contrast(1.1)", "Vivid"], ["contrast(0.9) brightness(1.1) saturate(0.8)", "Fade"], ["hue-rotate(180deg) saturate(1.2)", "Cool"]].map(([value, label]) => `<option value="${value}" ${state.editorFilter === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>${field("Caption text", "editorText", state.editorText)}${range("Frame thickness", "editorFrameWidth", state.editorFrameWidth, 0, 40, 1, `${state.editorFrameWidth}px`)}${state.editorFrameWidth ? `<div class="field"><label>Frame color</label><input data-setting="editorFrameColor" type="color" value="${state.editorFrameColor}"></div>` : ""}`;
  if (group === "upscale") return `<div class="field"><label>Scale factor</label>${segmented([1.5, 2, 3, 4].map((factor) => button(`${factor}×`, "upscale", state.upscaleFactor === factor, factor)))}</div><p class="hint">Enlarges images using smooth multi-step scaling.</p>`;
  if (group === "remove-bg") return `<p class="hint">The segmentation model runs in your browser. The first run downloads its model; your photo is never uploaded. <span id="bg-progress">${esc(state.bgProgress)}</span></p>`;
  if (group === "images-to-pdf") return `<p class="hint">Each readable image is placed on its own A4 page and fitted without cropping. Images are combined locally in your browser.</p>`;
  return "";
}

function renderWorkspace() {
  if (!workspace) return;
  if (group === "html-to-image") {
    workspace.innerHTML = `<div class="workspace-panel"><div class="workspace-header"><strong>Paste HTML, then capture it as an image</strong></div><div class="workspace-body"><div class="preview-pane">${state.htmlResult ? `<img src="${state.htmlResult.url}" alt="Captured HTML">` : `<p class="hint">Your captured image will appear here.</p>`}</div><div class="controls-pane">${controlsHtml()}${messageHtml()}<div class="actions-row"><button class="btn btn-primary" data-action="capture" ${state.busy ? "disabled" : ""}>${state.busy ? "Capturing…" : "Capture as image"}</button>${state.htmlResult ? `<button class="btn btn-secondary" data-action="download-html">Download</button>` : ""}</div></div></div></div>`;
    bindWorkspaceEvents();
    return;
  }
  if (!state.items.length) {
    workspace.innerHTML = `<div class="dropzone" data-dropzone role="button" tabindex="0"><div class="dropzone-icon" aria-hidden="true">📁</div><h3>Drag &amp; drop ${inputFormat ? `${esc(inputFormat.label)} images` : "images"} here</h3><p>or click to browse — ${inputFormat ? `${esc(inputFormat.label)} files only` : "JPG, PNG, WEBP, GIF, HEIC, SVG and more"}. Files never leave your device.</p><span class="btn btn-primary">Choose files</span><input class="file-input" data-files type="file" multiple accept="${esc(fileAccept)}"></div>${messageHtml()}`;
    bindWorkspaceEvents();
    return;
  }
  const item = activeItem();
  const cropOverlay = group === "crop" ? state.cropBoxes.map((box) => overlayHtml(box, "crop-overlay")).join("") : "";
  const blurOverlay = group === "blur-face" ? state.blurBoxes.map((box) => overlayHtml(box, "blur-overlay")).join("") : "";
  const isGifMerge = group === "convert-gif" || (group === "convert-from-jpg" && state.fromJpgTarget === "image/gif");
  const fileRows = state.items.length > 1 ? `<div class="queue-list">${state.items.map((entry) => `<div class="queue-item" style="border-color:${entry.id === item?.id ? "var(--color-primary)" : "var(--color-border)"}">${entry.img ? `<img src="${entry.url}" alt="" data-action="activate" data-value="${entry.id}">` : "⚠️"}<span class="name" data-action="activate" data-value="${entry.id}">${esc(entry.file.name)}</span>${entry.resultBlob ? `<span class="pill">✓</span>` : ""}<button class="btn btn-ghost btn-sm" data-action="remove" data-value="${entry.id}" aria-label="Remove ${esc(entry.file.name)}">✕</button></div>`).join("")}</div>` : "";
  const preview = item?.img ? `<div class="preview-canvas-wrap" data-preview><img src="${group === "crop" ? item.url : item.resultUrl || item.url}" alt="${esc(item.file.name)}">${cropOverlay || blurOverlay}</div>` : `<p class="hint">${esc(item?.loadError || "Preview unavailable for this file.")}</p>`;
  const size = item ? `<div class="size-compare"><span>Original: <b>${Engine.formatBytes(item.file.size)}</b></span>${item.resultBlob ? `<span>Output: <b>${Engine.formatBytes(item.resultBlob.size)}</b></span>${item.resultBlob.size < item.file.size ? `<span class="saved">-${Math.round((1 - item.resultBlob.size / item.file.size) * 100)}%</span>` : ""}` : ""}</div>` : "";
  const processLabel = isGifMerge ? "Create animated GIF" : group === "images-to-pdf" ? "Create PDF" : "Process & preview";
  const resultButtons = `${group === "images-to-pdf" && state.pdfResult ? `<button class="btn btn-secondary" data-action="download-pdf">Download PDF</button>` : ""}${item?.resultBlob && !isGifMerge ? `<button class="btn btn-secondary" data-action="download-result">Download result</button>` : ""}${isGifMerge && state.items[0]?.resultBlob ? `<button class="btn btn-secondary" data-action="download-gif">Download GIF</button>` : ""}${!isGifMerge && state.items.filter((entry) => entry.resultBlob).length > 1 ? `<button class="btn btn-secondary" data-action="download-zip">Download all (.zip)</button>` : ""}`;
  workspace.innerHTML = `<div class="workspace-panel"><div class="workspace-header"><div class="file-meta"><strong>${state.items.length} file${state.items.length === 1 ? "" : "s"} loaded</strong><button class="btn btn-ghost btn-sm" data-action="add-files">+ Add more</button><input class="file-input" data-files type="file" multiple accept="${esc(fileAccept)}"></div><button class="btn btn-ghost btn-sm" data-action="reset">Clear all</button></div><div class="workspace-body"><div class="preview-pane">${preview}${fileRows}${size}</div><div class="controls-pane">${controlsHtml()}${messageHtml()}<div class="actions-row"><button class="btn btn-primary" data-action="process" ${state.busy ? "disabled" : ""}>${state.busy ? "Processing…" : processLabel}</button>${resultButtons}</div></div></div></div>`;
  bindWorkspaceEvents();
}

function overlayHtml(box, className) {
  return `<div class="${className}" style="left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%"></div>`;
}
function messageHtml() {
  return state.message ? `<div class="status-banner ${esc(state.message.type)}" role="status">${esc(state.message.text)}</div>` : "";
}
function setMessage(type, text) { state.message = { type, text }; renderWorkspace(); }
function setSetting(name, value) {
  if (["quality", "opacity", "wmOpacity"].includes(name)) value = Number(value);
  else if (["width", "height", "resizePercent", "angle", "wmFontSize", "blurStrength", "editorFrameWidth", "upscaleFactor", "htmlWidth", "gifFrameDelay", "cropX", "cropY", "cropW", "cropH"].includes(name)) value = Number(value);
  state[name] = value;
  if (name === "cropX" || name === "cropY" || name === "cropW" || name === "cropH") {
    const box = { ...(state.cropBoxes[0] || { x: 0, y: 0, w: 100, h: 100 }) };
    const map = { cropX: "x", cropY: "y", cropW: "w", cropH: "h" };
    box[map[name]] = Math.max(0, Math.min(100, value));
    state.cropBoxes = [box];
    updateOverlays();
  }
  if (name === "width" && state.lockAspect && activeItem()?.img) state.height = Math.round(value * activeItem().img.naturalHeight / activeItem().img.naturalWidth);
  if (name === "height" && state.lockAspect && activeItem()?.img) state.width = Math.round(value * activeItem().img.naturalWidth / activeItem().img.naturalHeight);
  if (name === "fromJpgTarget") renderWorkspace();
}

function bindWorkspaceEvents() {
  workspace.querySelectorAll("[data-setting]").forEach((input) => {
    const eventName = input.type === "range" ? "input" : "change";
    input.addEventListener(eventName, () => {
      const name = input.dataset.setting;
      if (name === "wmLogoFile") state.wmLogoFile = input.files?.[0] || null;
      else if (input.type === "checkbox") setSetting(name, input.checked);
      else setSetting(name, input.value);
      const output = workspace.querySelector(`[data-value="${name}"]`);
      if (output && input.type === "range") output.textContent = ["quality"].includes(name) ? `${Math.round(Number(input.value) * 100)}%` : name === "wmOpacity" ? `${Math.round(Number(input.value) * 100)}%` : name === "angle" ? `${input.value}°` : name === "editorFrameWidth" ? `${input.value}px` : name === "resizePercent" ? `${input.value}%` : input.value;
    });
  });
  workspace.querySelectorAll("[data-action]").forEach((element) => element.addEventListener("click", handleAction));
  const fileInput = workspace.querySelector("[data-files]");
  const dropzone = workspace.querySelector("[data-dropzone]");
  if (fileInput) fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });
  if (dropzone) {
    dropzone.addEventListener("click", (event) => { if (!event.target.closest("input")) fileInput.click(); });
    dropzone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") fileInput.click(); });
    dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dropzone.classList.add("dragover"); });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (event) => { event.preventDefault(); dropzone.classList.remove("dragover"); addFiles(event.dataTransfer.files); });
  }
  const preview = workspace.querySelector("[data-preview]");
  if (preview && ["crop", "blur-face"].includes(group)) bindRegionDrawer(preview, group === "crop");
}

function updateOverlays() {
  const preview = workspace.querySelector("[data-preview]");
  if (!preview) return;
  const className = group === "crop" ? "crop-overlay" : "blur-overlay";
  const boxes = group === "crop" ? state.cropBoxes : state.blurBoxes;
  preview.querySelectorAll(`.${className}`).forEach((node) => node.remove());
  boxes.forEach((box) => preview.insertAdjacentHTML("beforeend", overlayHtml(box, className)));
}
function bindRegionDrawer(preview, single) {
  let start = null;
  let draft = null;
  const overlay = preview;
  overlay.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const rect = overlay.getBoundingClientRect();
    start = { x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)) };
    draft = { ...start, w: 0, h: 0 };
    overlay.setPointerCapture(event.pointerId);
  });
  overlay.addEventListener("pointermove", (event) => {
    if (!start || !draft) return;
    const rect = overlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
    const y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100));
    let width = Math.abs(x - start.x);
    let height = Math.abs(y - start.y);
    let left = Math.min(start.x, x);
    let top = Math.min(start.y, y);
    const image = activeItem()?.img;
    if (single && state.cropAspect && image) {
      const maxWidth = start.x <= x ? 100 - start.x : start.x;
      const maxHeight = start.y <= y ? 100 - start.y : start.y;
      const widthPx = Math.min(maxWidth / 100 * image.naturalWidth, maxHeight / 100 * image.naturalHeight * state.cropAspect, Math.max(width / 100 * image.naturalWidth, height / 100 * image.naturalHeight * state.cropAspect));
      width = widthPx / image.naturalWidth * 100;
      height = widthPx / state.cropAspect / image.naturalHeight * 100;
      left = start.x <= x ? start.x : start.x - width;
      top = start.y <= y ? start.y : start.y - height;
    }
    draft = { x: left, y: top, w: width, h: height };
    let shape = overlay.querySelector(".drawer-draft");
    if (!shape) { overlay.insertAdjacentHTML("beforeend", `<div class="${single ? "crop-overlay" : "blur-overlay"} drawer-draft"></div>`); shape = overlay.querySelector(".drawer-draft"); }
    Object.assign(shape.style, { left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%`, opacity: ".8" });
  });
  overlay.addEventListener("pointerup", () => {
    if (draft && draft.w > 2 && draft.h > 2) {
      if (single) state.cropBoxes = [draft];
      else state.blurBoxes.push(draft);
      const control = workspace.querySelector("[data-action=clear-blur]");
      if (!single && !control) renderWorkspace(); else updateOverlays();
    }
    start = null; draft = null;
    overlay.querySelector(".drawer-draft")?.remove();
  });
}

async function addFiles(fileList) {
  state.message = null;
  for (const file of Array.from(fileList || []).filter((entry) => entry.size)) {
    let mime = null;
    try { mime = await Engine.detectImageMime(file); } catch { /* Signature inspection is best-effort. */ }
    if (inputFormat && !matchesFormat(file, mime)) { state.message = { type: "warn", text: `This page accepts ${inputFormat.label} files only; mismatched files were skipped.` }; continue; }
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, img: null, url: URL.createObjectURL(file), isGif: mime === "image/gif" || file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif"), loadError: null, resultBlob: null, resultUrl: null, processError: null };
    state.items.push(item);
    state.activeId ||= item.id;
    renderWorkspace();
    try {
      if (Engine.isLikelyUndecodable(file)) throw new Error(`Browsers can't preview .${file.name.split(".").pop().toUpperCase()} files directly. Export a JPG/TIFF preview from your camera software if conversion fails.`);
      const blob = await Engine.normalizeToDecodable(file);
      item.img = await Engine.loadImageElement(blob);
      if (group === "crop" && state.cropAspect && state.cropBoxes[0]?.w === 100) state.cropBoxes = [cropBoxForAspect(state.cropAspect, item.img.naturalWidth, item.img.naturalHeight)];
    } catch (error) { item.loadError = error.message; }
  }
  renderWorkspace();
}
function matchesFormat(file, mime) {
  if (mime && inputFormat.mimes.length) return inputFormat.mimes.includes(mime);
  if (file.type.startsWith("image/") && inputFormat.mimes.length) return inputFormat.mimes.includes(file.type);
  return inputFormat.extensions.includes(file.name.split(".").pop().toLowerCase());
}
function cropBoxForAspect(aspect, width, height) {
  const imageAspect = width / height;
  if (imageAspect > aspect) { const w = aspect / imageAspect * 100; return { x: (100 - w) / 2, y: 0, w, h: 100 }; }
  const h = imageAspect / aspect * 100; return { x: 0, y: (100 - h) / 2, w: 100, h };
}

async function processOne(item) {
  if (item.loadError || !item.img) throw new Error(item.loadError || "Image failed to load.");
  const img = item.img;
  switch (group) {
    case "compress": {
      if (formatMime.compress === "image/svg+xml") {
        const text = await item.file.text();
        const minified = text.replace(/<!--[\\s\\S]*?-->/g, "").replace(/\\s{2,}/g, " ").replace(/>\\s+</g, "><").trim();
        return { blob: new Blob([minified], { type: "image/svg+xml" }), width: img.naturalWidth, height: img.naturalHeight };
      }
      if (formatMime.compress === "image/gif" && item.isGif) {
        const decoded = await Gif.decodeGif(item.file);
        const frames = await Gif.transformGifFrames(decoded, (canvas) => canvas);
        return { blob: await Gif.encodeGif(frames, { maxColors: Math.max(8, Math.round(state.quality * 256)) }), width: decoded.width, height: decoded.height };
      }
      if (state.targetBytes) return Engine.compressToTargetSize(img, state.targetBytes, formatMime.compress === "image/gif" ? "image/jpeg" : formatMime.compress);
      return Engine.compressImage(img, { quality: state.quality, mime: formatMime.compress });
    }
    case "resize": {
      const mime = formatMime.resize === "image/gif" ? "image/png" : formatMime.resize;
      if (formatMime.resize === "image/gif" && item.isGif) {
        const decoded = await Gif.decodeGif(item.file);
        const width = state.resizeMode === "%" ? decoded.width * state.resizePercent / 100 : state.width || decoded.width;
        const height = state.resizeMode === "%" ? decoded.height * state.resizePercent / 100 : state.height || decoded.height;
        const frames = await Gif.transformGifFrames(decoded, (source) => { const canvas = Engine.makeCanvas(width, height); canvas.getContext("2d").drawImage(source, 0, 0, width, height); return canvas; });
        return { blob: await Gif.encodeGif(frames), width, height };
      }
      return Engine.resizeImage(img, { width: state.resizeMode === "px" ? state.width || img.naturalWidth : undefined, height: state.resizeMode === "px" ? state.height || img.naturalHeight : undefined, percent: state.resizeMode === "%" ? state.resizePercent : undefined, mime });
    }
    case "crop": {
      const box = state.cropBoxes[0] || { x: 0, y: 0, w: 100, h: 100 };
      const crop = { x: box.x * img.naturalWidth / 100, y: box.y * img.naturalHeight / 100, width: box.w * img.naturalWidth / 100, height: box.h * img.naturalHeight / 100, mime: formatMime.crop === "image/gif" ? "image/png" : formatMime.crop };
      if (formatMime.crop === "image/gif" && item.isGif) {
        const decoded = await Gif.decodeGif(item.file);
        const frames = await Gif.transformGifFrames(decoded, (source) => { const canvas = Engine.makeCanvas(crop.width, crop.height); canvas.getContext("2d").drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height); return canvas; });
        return { blob: await Gif.encodeGif(frames), width: crop.width, height: crop.height };
      }
      return Engine.cropImage(img, crop);
    }
    case "rotate": {
      const rotateScope = Presets.rotateScopeFromSlug(slug);
      if ((rotateScope === "landscape" && img.naturalWidth < img.naturalHeight) || (rotateScope === "portrait" && img.naturalWidth >= img.naturalHeight)) {
        const canvas = Engine.makeCanvas(img.naturalWidth, img.naturalHeight);
        canvas.getContext("2d").drawImage(img, 0, 0);
        const blob = await Engine.canvasToBlob(canvas, formatMime.rotate);
        return { blob, width: canvas.width, height: canvas.height };
      }
      if (formatMime.rotate === "image/gif" && item.isGif) {
        const decoded = await Gif.decodeGif(item.file);
        const swap = Math.abs(state.angle % 180) === 90;
        const width = swap ? decoded.height : decoded.width, height = swap ? decoded.width : decoded.height;
        const frames = await Gif.transformGifFrames(decoded, (source) => { const canvas = Engine.makeCanvas(width, height), ctx = canvas.getContext("2d"); ctx.translate(width / 2, height / 2); ctx.rotate(state.angle * Math.PI / 180); ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1); ctx.drawImage(source, -source.width / 2, -source.height / 2); return canvas; });
        return { blob: await Gif.encodeGif(frames), width, height };
      }
      return Engine.rotateImage(img, { angle: state.angle, flipH: state.flipH, flipV: state.flipV, mime: formatMime.rotate === "image/gif" ? "image/png" : formatMime.rotate });
    }
    case "convert-jpg": case "convert-png": case "convert-webp": case "convert-raw":
      return Engine.convertFormat(img, { mime: formatMime.convert, quality: state.quality });
    case "convert-avif": {
      const result = await Engine.convertFormat(img, { mime: "image/avif", quality: state.quality });
      if (result.blob.type !== "image/avif") { state.message = { type: "warn", text: "Your browser can't encode AVIF yet — exported as WEBP instead." }; return Engine.convertFormat(img, { mime: "image/webp", quality: state.quality }); }
      return result;
    }
    case "convert-from-jpg":
      if (state.fromJpgTarget === "image/gif") throw new Error("gif-merge-handled-separately");
      return Engine.convertFormat(img, { mime: state.fromJpgTarget, quality: state.quality });
    case "watermark": {
      const logo = state.wmLogoFile ? await Engine.loadImageElement(state.wmLogoFile) : undefined;
      return Engine.watermarkImage(img, { text: logo ? undefined : state.wmText, logo, fontSize: state.wmFontSize, color: state.wmColor, opacity: state.wmOpacity, position: state.wmPosition, mime: item.file.type === "image/png" ? "image/png" : "image/jpeg" });
    }
    case "meme": return Engine.memeCaption(img, { topText: state.memeTop, bottomText: state.memeBottom, mime: "image/jpeg" });
    case "blur-face": return Engine.pixelateRegions(img, { regions: state.blurBoxes.map((box) => ({ x: box.x * img.naturalWidth / 100, y: box.y * img.naturalHeight / 100, width: box.w * img.naturalWidth / 100, height: box.h * img.naturalHeight / 100 })), strength: state.blurStrength, mime: item.file.type === "image/png" ? "image/png" : "image/jpeg" });
    case "photo-editor": return Engine.applyPhotoEdits(img, { filter: state.editorFilter, text: state.editorText ? { value: state.editorText, x: 50, y: 88, size: Math.round(img.naturalWidth / 16), color: "#ffffff" } : undefined, frame: state.editorFrameWidth ? { width: state.editorFrameWidth, color: state.editorFrameColor } : undefined, mime: item.file.type === "image/png" ? "image/png" : "image/jpeg" });
    case "upscale": return Engine.upscaleImage(img, { scale: state.upscaleFactor, mime: item.file.type === "image/png" ? "image/png" : "image/jpeg", sharpen: true });
    case "remove-bg": {
      state.bgProgress = "Loading AI model…"; renderWorkspace();
      let file = item.file;
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type.toLowerCase())) {
        const canvas = Engine.makeCanvas(img.naturalWidth, img.naturalHeight); canvas.getContext("2d").drawImage(img, 0, 0);
        file = new File([await Engine.canvasToBlob(canvas, "image/png")], `${Engine.baseName(file.name)}.png`, { type: "image/png" });
      }
      const blob = await Engine.removeBackgroundClientSide(file, (label, current, total) => { state.bgProgress = `${label} ${total > 0 ? `${Math.round(current / total * 100)}%` : ""}`; const target = document.querySelector("#bg-progress"); if (target) target.textContent = state.bgProgress; });
      state.bgProgress = "";
      const result = await Engine.loadImageElement(blob);
      return { blob, width: result.naturalWidth, height: result.naturalHeight };
    }
    default: return Engine.convertFormat(img, { mime: "image/jpeg" });
  }
}

async function processAll() {
  state.message = null; state.busy = true; state.pdfResult = null; renderWorkspace();
  try {
    if (group === "images-to-pdf") {
      const ready = state.items.filter((item) => item.img && !item.loadError);
      if (!ready.length) throw new Error("Add at least one image that can be opened in your browser.");
      state.pdfResult = await Engine.createImagesPdf(ready.map((item) => item.img));
      state.message = { type: "success", text: `PDF created with ${ready.length} image${ready.length === 1 ? "" : "s"}.` };
    } else if (group === "convert-gif" || (group === "convert-from-jpg" && state.fromJpgTarget === "image/gif")) {
      const ready = state.items.filter((item) => item.img && !item.loadError);
      if (!ready.length) throw new Error("Add at least one image first.");
      const width = ready[0].img.naturalWidth, height = ready[0].img.naturalHeight;
      const frames = ready.map((entry) => { const canvas = Engine.makeCanvas(width, height); const ctx = canvas.getContext("2d"); ctx.drawImage(entry.img, 0, 0, width, height); return { imageData: ctx.getImageData(0, 0, width, height), delay: state.gifFrameDelay }; });
      const blob = await Gif.encodeGif(frames, { loop: 0 });
      state.items[0].resultBlob = blob; state.items[0].resultUrl = URL.createObjectURL(blob);
      state.message = { type: "success", text: `Animated GIF created from ${ready.length} image(s).` };
    } else {
      let successes = 0;
      for (const item of state.items) {
        if (item.loadError) continue;
        try { const result = await processOne(item); item.resultBlob = result.blob; item.resultUrl = result.url || URL.createObjectURL(result.blob); item.processError = null; successes++; }
        catch (error) { item.processError = error.message; }
      }
      state.message ||= successes ? { type: "success", text: `Done! ${successes} file(s) processed — everything stayed on your device.` } : { type: "error", text: "Nothing could be processed. Check the file errors below." };
    }
  } catch (error) { state.message = { type: "error", text: error.message || "Processing failed." }; }
  finally { state.busy = false; state.bgProgress = ""; renderWorkspace(); }
}

async function captureHtml() {
  state.busy = true; state.message = null; renderWorkspace();
  try {
    const mime = slug.includes("png") ? "image/png" : slug.includes("svg") ? "image/svg+xml" : "image/jpeg";
    state.htmlResult = await Engine.htmlSnippetToImage({ html: state.htmlSource, width: state.htmlWidth, mime: mime === "image/svg+xml" ? "image/png" : mime });
    state.message = { type: "success", text: "Captured! Download it below." };
  } catch { state.message = { type: "error", text: "Couldn't render that HTML. Check the markup and try again." }; }
  finally { state.busy = false; renderWorkspace(); }
}

function downloadResult(item) {
  if (!item?.resultBlob) return;
  Engine.downloadBlob(item.resultBlob, `${Engine.baseName(item.file.name)}-${slug}.${Engine.extFromMime(item.resultBlob.type || formatMime.convert)}`);
}
async function downloadZip() {
  const ready = state.items.filter((item) => item.resultBlob);
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  ready.forEach((item) => zip.file(`${Engine.baseName(item.file.name)}-${slug}.${Engine.extFromMime(item.resultBlob.type)}`, item.resultBlob));
  Engine.downloadBlob(await zip.generateAsync({ type: "blob" }), `${slug}-batch.zip`);
}

function handleAction(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action, value = target.dataset.value;
  if (action === "add-files") workspace.querySelector("[data-files]").click();
  else if (action === "reset") { state.items.forEach((item) => { URL.revokeObjectURL(item.url); if (item.resultUrl) URL.revokeObjectURL(item.resultUrl); }); state.items = []; state.activeId = null; state.message = null; state.pdfResult = null; renderWorkspace(); }
  else if (action === "activate") { state.activeId = value; renderWorkspace(); }
  else if (action === "remove") { state.items = state.items.filter((item) => item.id !== value); if (state.activeId === value) state.activeId = null; renderWorkspace(); }
  else if (action === "process") processAll();
  else if (action === "capture") captureHtml();
  else if (action === "download-result") downloadResult(activeItem());
  else if (action === "download-gif") Engine.downloadBlob(state.items[0].resultBlob, `${slug}.gif`);
  else if (action === "download-pdf") Engine.downloadBlob(state.pdfResult, "images.pdf");
  else if (action === "download-html") Engine.downloadBlob(state.htmlResult.blob, `${slug}.${Engine.extFromMime(state.htmlResult.blob.type)}`);
  else if (action === "download-zip") downloadZip();
  else if (action === "target") { state.targetBytes = value === "off" ? null : Number(value); renderWorkspace(); }
  else if (action === "resize-mode") { state.resizeMode = value; renderWorkspace(); }
  else if (action === "instagram") { [state.width, state.height] = value.split("x").map(Number); state.resizeMode = "px"; renderWorkspace(); }
  else if (action === "crop-aspect") { state.cropAspect = value === "free" ? null : Number(value); const img = activeItem()?.img; if (state.cropAspect && img) state.cropBoxes = [cropBoxForAspect(state.cropAspect, img.naturalWidth, img.naturalHeight)]; renderWorkspace(); }
  else if (action === "angle") { state.angle = Number(value); renderWorkspace(); }
  else if (action === "wm-position") { state.wmPosition = value; renderWorkspace(); }
  else if (action === "upscale") { state.upscaleFactor = Number(value); renderWorkspace(); }
  else if (action === "clear-blur") { state.blurBoxes = []; renderWorkspace(); }
}

function bindSearch() {
  const input = document.querySelector(".search-input"), results = document.querySelector(".search-results");
  if (!input || !results) return;
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    const matches = query ? Object.entries(siteData.sitePages).filter(([key, page]) => key.includes(query) || page.heading.toLowerCase().includes(query)).slice(0, 8) : [];
    results.innerHTML = matches.map(([key, page]) => `<a class="search-result-item" href="/${key}/">${esc(page.heading)}</a>`).join("");
    results.hidden = !matches.length;
  });
  input.addEventListener("blur", () => setTimeout(() => { results.hidden = true; }, 150));
  input.addEventListener("focus", () => { if (results.childElementCount) results.hidden = false; });
}

async function initialize() {
  try {
    const response = await fetch("/data/tools.json");
    if (!response.ok) throw new Error("Unable to load tool data.");
    siteData = await response.json();
    bindSearch();
    if (workspace) renderWorkspace();
  } catch (error) {
    if (workspace) workspace.innerHTML = `<p class="status-banner error">${esc(error.message)}</p>`;
  }
}

initialize();
