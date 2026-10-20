import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/landing";

export const dynamic = "force-static";

/* Aperto a tutti, crawler delle AI compresi (GPTBot, ClaudeBot,
   PerplexityBot): comparire nelle loro risposte e' uno degli scopi. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    ...(SITE_URL ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
  };
}
