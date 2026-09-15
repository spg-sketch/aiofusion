export const MEDIA_RESEARCH_REGIONS = ["Global", "UK", "Europe", "US"] as const;
export type MediaResearchRegion = (typeof MEDIA_RESEARCH_REGIONS)[number];

export function normaliseMediaResearchRegions(value: unknown): {
  valid: boolean;
  regions: MediaResearchRegion[];
} {
  if (value === undefined) return { valid: true, regions: ["Global"] };
  if (!Array.isArray(value)) return { valid: false, regions: ["Global"] };
  if (value.some((region) => typeof region !== "string" || !MEDIA_RESEARCH_REGIONS.includes(region as MediaResearchRegion))) {
    return { valid: false, regions: ["Global"] };
  }
  const regions = value.slice(0, 4) as MediaResearchRegion[];
  return { valid: true, regions: regions.length ? regions : ["Global"] };
}