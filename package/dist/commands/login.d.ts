/**
 * Save a provider-wide key and describe it for the terminal. `model` is kept
 * for the `/login provider model key` one-liner and only recorded as the
 * credential's origin — the key itself is reused by every model of that
 * provider. Shared by the `/login` command and the guided flow in the app.
 */
export declare function saveScopedKey(providerId: any, providerLabel: any, model: any, key: any): string;
export declare function maskLoginEcho(args: any): string;
export declare const loginCommand: {
    name: string;
    description: string;
    run({ args, actions }: {
        args: any;
        actions: any;
    }): {
        message: string;
    };
};
