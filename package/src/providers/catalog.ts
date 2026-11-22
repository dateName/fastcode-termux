import { listModelsHttp, streamChatCompletion, type StreamOptions } from "./openaiCompatible.js";
import type { Provider } from "../types.js";

/**
 * OpenAI-compatible provider catalog.
 *
 * Endpoints here are the ones recorded in yq.txt with an "official docs" note.
 * Providers with account-specific placeholders keep the `{...}` token; it is
 * resolved at request time by `spec.ts` from the matching env var:
 *   {region}      AWS_REGION
 *   {account_id}  CLOUDFLARE_ACCOUNT_ID
 *   {project_id}  GOOGLE_CLOUD_PROJECT
 *   {deployment}  AZURE_OPENAI_DEPLOYMENT
 *   {endpoint_id} RUNPOD_ENDPOINT_ID
 *   {resource}    AZURE_OPENAI_RESOURCE
 *   {location}    GOOGLE_CLOUD_LOCATION
 *
 * `defaultModel` is intentionally empty when we do not have a verified id:
 * the picker then offers "Enter model ID manually" instead of guessing.
 */
interface CatalogSpec {
    id: string;
    label: string;
    baseUrl: string;
    authEnv: string[];
    defaultModel?: string;
    chatPath?: string;
    modelsPath?: string | null;
    authHeaderName?: string;
    authPrefix?: string;
    query?: Record<string, string>;
    reasoning?: string;
}

function options(spec: CatalogSpec): StreamOptions {
    return {
        baseUrl: spec.baseUrl,
        staticModels: [],
        ...(spec.chatPath ? { chatPath: spec.chatPath } : {}),
        ...(spec.modelsPath !== undefined ? { modelsPath: spec.modelsPath } : {}),
        ...(spec.authHeaderName ? { authHeaderName: spec.authHeaderName } : {}),
        ...(spec.authPrefix !== undefined ? { authPrefix: spec.authPrefix } : {}),
        ...(spec.query ? { query: spec.query } : {}),
        ...(spec.reasoning ? { reasoning: spec.reasoning } : {}),
    };
}

function build(spec: CatalogSpec): Provider {
    const opts = options(spec);
    return {
        id: spec.id,
        label: spec.label,
        authEnv: spec.authEnv,
        baseUrl: spec.baseUrl,
        defaultModel: spec.defaultModel ?? "",
        listModels: (apiKey) => listModelsHttp({ ...opts, apiKey }),
        stream: (req, apiKey) => streamChatCompletion(req, { ...opts, apiKey, providerId: spec.id }),
        ...(spec.modelsPath !== undefined ? { modelsPath: spec.modelsPath } : {}),
    };
}

const SPECS: CatalogSpec[] = [
    // Aggregators / gateways (OpenAI-compatible direct)
    { id: "aihubmix", label: "AIHubMix", baseUrl: "https://aihubmix.com/v1", authEnv: ["AIHUBMIX_API_KEY"] },
    { id: "aiwave", label: "AIWave", baseUrl: "https://aiwave.live/v1", authEnv: ["AIWAVE_API_KEY"] },
    { id: "hefu", label: "HeFu (合富宝)", baseUrl: "https://api.hefu.hk/v1", authEnv: ["HEFUAI_API_KEY"] },
    { id: "4sapi", label: "4SAPI", baseUrl: "https://4sapi.com/v1", authEnv: ["4SAPI_API_KEY"] },
    { id: "aigateway", label: "AIgateway", baseUrl: "https://api.aigateway.sh/v1", authEnv: ["AIG_KEY"] },
    { id: "dmxapi", label: "DMXAPI", baseUrl: "https://www.dmxapi.cn/v1", authEnv: ["DMXAPI_API_KEY"] },
    { id: "atlascloud", label: "Atlas Cloud", baseUrl: "https://api.atlascloud.ai/v1", authEnv: ["ATLASCLOUD_API_KEY"] },
    { id: "venice", label: "Venice AI", baseUrl: "https://api.venice.ai/api/v1", authEnv: ["VENICE_API_KEY"] },
    { id: "baseten", label: "Baseten", baseUrl: "https://inference.baseten.co/v1", authEnv: ["BASETEN_API_KEY"] },
    { id: "atomicchat", label: "Atomic Chat (local)", baseUrl: "http://localhost:1337/v1", authEnv: ["ATOMIC_CHAT_API_KEY"] },
    { id: "featherless", label: "Featherless", baseUrl: "https://api.featherless.ai/v1", authEnv: ["FEATHERLESS_API_KEY"] },
    { id: "sophnet", label: "SophNet", baseUrl: "https://www.sophnet.com/api/open-apis/v1", authEnv: ["SOPHNET_API_KEY"] },
    { id: "omnirouter", label: "OmniRoute (local)", baseUrl: "http://localhost:20128/v1", authEnv: ["OMNIROUTE_API_KEY"] },
    { id: "edenai", label: "Eden AI", baseUrl: "https://api.edenai.run/v3", authEnv: ["EDENAI_API_KEY"] },
    { id: "orcarouter", label: "OrcaRouter", baseUrl: "https://api.orcarouter.ai/v1", authEnv: ["ORCAROUTER_API_KEY"] },
    { id: "runpod", label: "Runpod", baseUrl: "https://api.runpod.ai/v2/{endpoint_id}/openai/v1", authEnv: ["RUNPOD_API_KEY"] },
    { id: "opencode-zen", label: "OpenCode Zen", baseUrl: "https://opencode.ai/zen/v1", authEnv: ["OPENCODE_API_KEY"] },
    { id: "opencode-go", label: "OpenCode Go", baseUrl: "https://opencode.ai/zen/go/v1", authEnv: ["OPENCODE_API_KEY"] },

    // Domestic (OpenAI-compatible direct)
    { id: "minimax", label: "MiniMax", baseUrl: "https://api.minimax.cn/v1", authEnv: ["MINIMAX_API_KEY"] },
    { id: "volcengine", label: "Volcengine Ark (豆包)", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", authEnv: ["ARK_API_KEY"] },
    { id: "qianfan", label: "Baidu Qianfan (文心)", baseUrl: "https://qianfan.baidubce.com/v2", authEnv: ["QIANFAN_API_KEY"] },
    { id: "hunyuan", label: "Tencent Hunyuan", baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", authEnv: ["HUNYUAN_API_KEY"] },
    { id: "stepfun", label: "StepFun (阶跃星辰)", baseUrl: "https://api.stepfun.com/v1", authEnv: ["STEPFUN_API_KEY"] },
    { id: "spark", label: "iFlytek Spark (讯飞星火)", baseUrl: "https://spark-api-open.xf-yun.com/v1", authEnv: ["SPARK_API_KEY"] },
    { id: "siliconflow", label: "SiliconFlow (硅基流动)", baseUrl: "https://api.siliconflow.cn/v1", authEnv: ["SILICONFLOW_API_KEY"] },
    { id: "302ai", label: "302.AI", baseUrl: "https://api.302.ai/v1", authEnv: ["AI302_API_KEY"] },

    // International (OpenAI-compatible direct)
    { id: "together", label: "Together AI", baseUrl: "https://api.together.ai/v1", authEnv: ["TOGETHER_API_KEY"] },
    { id: "fireworks", label: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1", authEnv: ["FIREWORKS_API_KEY"] },
    { id: "perplexity", label: "Perplexity", baseUrl: "https://api.perplexity.ai", authEnv: ["PERPLEXITY_API_KEY"], defaultModel: "sonar" },
    { id: "cerebras", label: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", authEnv: ["CEREBRAS_API_KEY"] },
    { id: "deepinfra", label: "DeepInfra", baseUrl: "https://api.deepinfra.com/v1/openai", authEnv: ["DEEPINFRA_API_KEY"] },
    { id: "nvidia", label: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", authEnv: ["NVIDIA_API_KEY"] },
    { id: "github-models", label: "GitHub Models", baseUrl: "https://models.github.ai/inference", authEnv: ["GITHUB_MODELS_TOKEN"] },
    { id: "huggingface", label: "Hugging Face", baseUrl: "https://router.huggingface.co/v1", authEnv: ["HF_TOKEN"] },
    { id: "requesty", label: "Requesty", baseUrl: "https://router.requesty.ai/v1", authEnv: ["REQUESTY_API_KEY"] },
    { id: "vllm", label: "vLLM (local)", baseUrl: "http://localhost:8000/v1", authEnv: [] },
    { id: "lmstudio", label: "LM Studio (local)", baseUrl: "http://localhost:1234/v1", authEnv: [] },
    { id: "cohere", label: "Cohere (compat)", baseUrl: "https://api.cohere.com/compatibility/v1", authEnv: ["COHERE_API_KEY"] },

    // Cloud platforms with account placeholders
    {
        id: "azure",
        label: "Azure OpenAI",
        baseUrl: "https://{resource}.openai.azure.com/openai/deployments/{deployment}",
        authEnv: ["AZURE_OPENAI_API_KEY"],
        authHeaderName: "api-key",
        authPrefix: "",
        query: { "api-version": "2024-10-21" },
    },
    {
        id: "cloudflare",
        label: "Cloudflare Workers AI",
        baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1",
        authEnv: ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
    },
    {
        id: "bedrock",
        label: "Amazon Bedrock",
        baseUrl: "https://bedrock-runtime.{region}.amazonaws.com/openai/v1",
        authEnv: ["AWS_BEARER_TOKEN_BEDROCK"],
        authPrefix: "Bearer ",
    },
    {
        id: "vertex",
        label: "Google Vertex AI",
        baseUrl: "https://{location}-aiplatform.googleapis.com/v1beta1/projects/{project_id}/locations/{location}/endpoints/openapi",
        authEnv: ["GOOGLE_ACCESS_TOKEN"],
        authPrefix: "Bearer ",
    },
];

export const CATALOG_PROVIDERS: Provider[] = SPECS.map(build);
