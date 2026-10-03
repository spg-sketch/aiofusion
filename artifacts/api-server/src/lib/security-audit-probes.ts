// Bounded data-only probes for isolated regression fixtures. Never target a
// published host or existing database with these tests.
export const SQL_DATA_PROBES = [
  "O'Brien & Sons (UK) - R&D",
  "' OR '1'='1' --",
  "quote'/**/OR/**/TRUE--",
  "' UNION SELECT NULL --",
  "%27%20OR%20TRUE%20--",
];