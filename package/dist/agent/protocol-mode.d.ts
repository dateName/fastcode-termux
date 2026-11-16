export type ToolProtocol = "legacy" | "native";
export type ToolCapability = "native" | "pseudo";
export declare function toolCapabilityKey(providerId: string, model: string): string;
export declare function rememberToolCapability(providerId: string, model: string, capability: ToolCapability): void;
export declare function resolveToolProtocol(config: any, providerId: string, model: string, env?: NodeJS.ProcessEnv): ToolProtocol;
export declare function withToolCapability(config: any, providerId: string, model: string, capability: ToolCapability): any;
export declare function isNativeUnsupportedError(message: string): boolean;
export declare function isToolPairingError(message: string): boolean;
