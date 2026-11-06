export const DEFAULT_CONTENT_MARKERS = [
    "-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "AKIA[0-9A-Z]{16}",
    "gh[pousr]_[A-Za-z0-9]{36,}",
    "xox[baprs]-[A-Za-z0-9-]{10,}",
    "AIza[0-9A-Za-z_-]{35}",
    "sk-[A-Za-z0-9]{32,}",
];
export const DEFAULT_EGRESS_CONFIG = {
    enabled: false,
    mode: "audit",
    denyPaths: [],
    denyGlobs: [],
    denyContentMarkers: [...DEFAULT_CONTENT_MARKERS],
    maxScanBytes: 1_000_000,
    scanToolOutput: true,
};
