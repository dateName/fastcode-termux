/**
 * Save a key scoped to one provider + model and describe it for the terminal.
 * Shared by the `/login` command and the guided flow in the app.
 */
export declare function saveScopedKey(providerId: any, providerLabel: any, model: any, key: any): string;
export declare const loginCommand: {
    name: string;
    description: string;
    run({ args, state, actions }: {
        args: any;
        state: any;
        actions: any;
    }): {
        message: string;
    };
};
