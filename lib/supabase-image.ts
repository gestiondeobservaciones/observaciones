type TransformOptions = {
  width?: number;
  height?: number;
  quality?: number;
  resize?: "cover" | "contain" | "fill";
  format?: "webp" | "jpeg" | "png";
};

const PUBLIC_MARKER = "/storage/v1/object/public/";
const RENDER_MARKER = "/storage/v1/render/image/public/";

function isSpecialScheme(src: string) {
  return src.startsWith("data:") || src.startsWith("blob:");
}

export function toSupabaseRenderUrl(src: string, opts: TransformOptions = {}) {
  if (!src || isSpecialScheme(src)) return src;

  try {
    const url = new URL(src);
    const { pathname } = url;

    let bucketPath = "";
    if (pathname.includes(RENDER_MARKER)) {
      bucketPath = pathname.slice(pathname.indexOf(RENDER_MARKER) + RENDER_MARKER.length);
    } else if (pathname.includes(PUBLIC_MARKER)) {
      bucketPath = pathname.slice(pathname.indexOf(PUBLIC_MARKER) + PUBLIC_MARKER.length);
      url.pathname = `${RENDER_MARKER}${bucketPath}`;
    } else {
      return src;
    }

    if (opts.width) url.searchParams.set("width", String(opts.width));
    if (opts.height) url.searchParams.set("height", String(opts.height));
    if (opts.quality) url.searchParams.set("quality", String(opts.quality));
    if (opts.resize) url.searchParams.set("resize", opts.resize);
    if (opts.format) url.searchParams.set("format", opts.format);

    return url.toString();
  } catch {
    return src;
  }
}

export function getThumbUrl(src: string, width = 160, quality = 45) {
  const safeWidth = Math.max(1, Math.round(width));
  return toSupabaseRenderUrl(src, { width: safeWidth, quality, resize: "contain" });
}
