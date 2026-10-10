import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wellness Tech Distribution",
    short_name: "Wellness Tech",
    description: "503A and 503B therapies for licensed practices.",
    start_url: "/",
    display: "standalone",
    background_color: "#efeae2",
    theme_color: "#184868",
    icons: [
      {
        src: "/images/wellness-tech-logo.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}