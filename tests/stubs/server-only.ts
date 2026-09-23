// Vitest has no equivalent of Next.js's "react-server" resolve condition, so the real
// `server-only` package throws unconditionally when imported here. This stub replaces it
// for tests only (see vitest.config.mts); the real guard still applies in the Next.js build.
export {};
