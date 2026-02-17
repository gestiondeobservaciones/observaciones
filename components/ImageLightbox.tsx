"use client";

import { useState } from "react";
import ThumbImage from "@/components/ThumbImage";

export default function ImageLightbox({
  src,
  alt = "Evidencia",
}: {
  src: string;
  alt?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!src) return null;

  return (
    <>
      <ThumbImage
        src={src}
        alt={alt}
        thumbWidth={120}
        style={{
          maxWidth: 120,
          cursor: "zoom-in",
          borderRadius: 6,
          border: "1px solid #ccc",
        }}
        onClick={() => setOpen(true)}
      />

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <img
            src={src}
            alt={alt}
            style={{
              maxWidth: "90%",
              maxHeight: "90%",
              borderRadius: 8,
            }}
          />
        </div>
      )}
    </>
  );
}
