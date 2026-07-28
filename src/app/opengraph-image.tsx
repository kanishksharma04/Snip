import { ImageResponse } from "next/og";

// nodejs, not edge: this project's own findings (see proxy.ts and the Step
// 13 commit) are that this Next.js/Vercel setup runs everything as a Node
// Lambda regardless of what's declared — matching that here rather than
// claiming an edge runtime that wouldn't actually be true.
export const runtime = "nodejs";

export const alt = "Snip — fast, private link shortening";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 140, fontWeight: 700, letterSpacing: -4 }}>
          Snip
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "#a1a1aa", marginTop: 8 }}>
          Short links. Real analytics. Edge-cached redirects.
        </div>
      </div>
    ),
    { ...size },
  );
}
