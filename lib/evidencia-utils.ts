const IMAGE_BUCKET = "evidencias";

type CompressOptions = {
  maxWidth?: number;
  maxHeight?: number;
  targetBytes?: number;
  quality?: number;
  minQuality?: number;
};

function replaceExtension(fileName: string, ext: string) {
  const cleanExt = ext.replace(/^\./, "");
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return `${fileName}.${cleanExt}`;
  return `${fileName.slice(0, dot)}.${cleanExt}`;
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

export async function compressImageForUpload(file: File, options: CompressOptions = {}) {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  let image: HTMLImageElement;
  try {
    image = await loadImageFromFile(file);
  } catch {
    return file;
  }

  const maxWidth = options.maxWidth ?? 1600;
  const maxHeight = options.maxHeight ?? 1600;
  const targetBytes = options.targetBytes ?? 220 * 1024;
  const minQuality = options.minQuality ?? 0.5;

  const baseScale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  let scale = baseScale;
  let quality = options.quality ?? 0.82;
  let outType: "image/webp" | "image/jpeg" = file.type === "image/png" ? "image/webp" : "image/jpeg";
  let lastBlob: Blob | null = null;

  for (let pass = 0; pass < 7; pass++) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, outType, quality);
    if (!blob && outType === "image/webp") {
      outType = "image/jpeg";
      blob = await canvasToBlob(canvas, outType, quality);
    }
    if (!blob) break;

    lastBlob = blob;
    if (blob.size <= targetBytes) break;

    if (quality > minQuality) {
      quality = Math.max(minQuality, quality - 0.08);
    } else {
      scale = Math.max(0.55, scale * 0.88);
    }
  }

  if (!lastBlob) return file;
  if (lastBlob.size >= file.size * 0.95) return file;

  const ext = outType === "image/webp" ? "webp" : "jpg";
  const nextName = replaceExtension(file.name, ext);

  return new File([lastBlob], nextName, {
    type: outType,
    lastModified: Date.now(),
  });
}

export function extractStoragePathFromUrl(fileUrl: string, bucket = IMAGE_BUCKET) {
  try {
    const parsed = new URL(fileUrl);
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
    ];
    for (const marker of markers) {
      const idx = parsed.pathname.indexOf(marker);
      if (idx >= 0) {
        const rawPath = parsed.pathname.slice(idx + marker.length);
        return decodeURIComponent(rawPath).replace(/^\/+/, "");
      }
    }
  } catch {
    // Ignore invalid URLs.
  }
  return null;
}

export function extractStoragePaths(fileUrls: Array<string | null | undefined>, bucket = IMAGE_BUCKET) {
  const paths = new Set<string>();
  for (const url of fileUrls) {
    if (!url) continue;
    const path = extractStoragePathFromUrl(url, bucket);
    if (path) paths.add(path);
  }
  return Array.from(paths);
}

