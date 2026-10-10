import type { MetadataRoute } from "next";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thewellnesstech.com").replace(/\/$/, "");

const routes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"] }> = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/products", priority: 0.9, changeFrequency: "weekly" },
  { path: "/exosomes", priority: 0.8, changeFrequency: "monthly" },
  { path: "/supplies", priority: 0.8, changeFrequency: "monthly" },
  { path: "/about", priority: 0.7, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.8, changeFrequency: "monthly" },
  { path: "/compliance", priority: 0.6, changeFrequency: "monthly" },
  { path: "/affiliates", priority: 0.6, changeFrequency: "monthly" },
  { path: "/developers", priority: 0.5, changeFrequency: "monthly" },
  { path: "/storefront", priority: 0.5, changeFrequency: "monthly" },
  { path: "/patient", priority: 0.5, changeFrequency: "monthly" },
  { path: "/signup", priority: 0.7, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return routes.map((route) => ({
    url: `${appUrl}${route.path === "/" ? "" : route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
