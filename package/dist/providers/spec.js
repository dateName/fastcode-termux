const ENV_MAP = {
    region: "AWS_REGION",
    account_id: "CLOUDFLARE_ACCOUNT_ID",
    project_id: "GOOGLE_CLOUD_PROJECT",
    deployment: "AZURE_OPENAI_DEPLOYMENT",
};
export function resolveBaseUrl(spec) {
    return spec.baseUrl.replace(/\{(\w+)\}/g, (_, key) => {
        const envName = ENV_MAP[key];
        const value = envName ? process.env[envName] : undefined;
        if (!value)
            throw new Error(`Missing ${envName ?? key} for placeholder {${key}}`);
        return value;
    });
}
export function buildRequestUrl(spec, path, params) {
    const base = resolveBaseUrl(spec);
    const merged = { ...spec.pathParams, ...params };
    const resolvedPath = path.replace(/\{(\w+)\}/g, (_, key) => merged[key] ?? `{${key}}`);
    const query = spec.query ? "?" + new URLSearchParams(spec.query).toString() : "";
    return base + resolvedPath + query;
}
export function buildHeaders(spec, apiKey, extra) {
    const headers = {
        [spec.authHeaderName ?? "authorization"]: (spec.authPrefix ?? "Bearer ") + apiKey,
        ...extra,
    };
    return headers;
}
