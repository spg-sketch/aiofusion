export function buildAdminGenerationClassification(isDemo: boolean): {
  generatedFromUrl: true;
  demo?: true;
  recentActivity: string;
} {
  return {
    generatedFromUrl: true,
    ...(isDemo ? { demo: true as const } : {}),
    recentActivity: isDemo ? "Demo generated from URL" : "Generated from URL",
  };
}