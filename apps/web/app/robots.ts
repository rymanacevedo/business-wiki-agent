import type { MetadataRoute } from "next";

// The demo is for Reviewers only: no crawler may index any of it.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
