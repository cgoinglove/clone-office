import type { MetadataRoute } from "next";

// What a browser needs to install the app as a window of its own (Chrome's "Install Clone Office"):
// the app runs on this computer, so the installed window opens it at 127.0.0.1 like the tab does.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clone Office",
    short_name: "Clone Office",
    description:
      "Send your clone: an AI that works like you, for everyone on your team.",
    start_url: "/home",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
