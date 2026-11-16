export type ToolProtocol = "legacy" | "native";
export type ToolCapability = "native" | "pseudo";
export declare function toolCapabilityKey(providerId: string, model: string): string;
export declare function rememberToolCapability(providerId: string, model: string, capability: ToolCapability): void;
/** Current process view only; legacy config values are deliberately ignored. */
export declare function runtimeToolCapability(providerId: string, model: string): ToolCapability | undefined;
export declare function resolveToolProtocol(config: any, providerId: string, model: string, env?: NodeJS.ProcessEnv): ToolProtocol;
export declare function withToolCapability(config: any, providerId: string, model: string, capability: ToolCapability): any;
export declare function isNativeUnsupportedError(message: string): boolean;
export declare function isToolPairingError(message: string): boolean;
