export type ToolProtocol = "legacy" | "native";
export type ToolCapability = "native" | "pseudo";
export declare function toolCapabilityKey(providerId: string, model: string): string;
export declare function resolveToolProtocol(config: any, providerId: string, model: string, env?: NodeJS.ProcessEnv): ToolProtocol;
export declare function withToolCapability(config: any, providerId: string, model: string, capability: ToolCapability): any;
export declare function isNativeUnsupportedError(message: string): boolean;
