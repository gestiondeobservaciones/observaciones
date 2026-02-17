"use client";

import { useMemo, useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { getThumbUrl } from "@/lib/supabase-image";

type ThumbImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  thumbWidth?: number;
  thumbQuality?: number;
};

export default function ThumbImage({
  src,
  thumbWidth = 160,
  thumbQuality = 45,
  loading,
  decoding,
  onError,
  ...rest
}: ThumbImageProps) {
  const [failed, setFailed] = useState(false);

  const thumbSrc = useMemo(() => {
    if (!src || typeof src !== "string") return src;
    return failed ? src : getThumbUrl(src, thumbWidth, thumbQuality);
  }, [src, failed, thumbWidth, thumbQuality]);

  return (
    <img
      src={thumbSrc || undefined}
      loading={loading ?? "lazy"}
      decoding={decoding ?? "async"}
      onError={(e) => {
        if (!failed) setFailed(true);
        onError?.(e);
      }}
      {...rest}
    />
  );
}
