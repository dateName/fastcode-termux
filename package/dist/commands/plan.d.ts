import { type SessionPlan } from "../session/plan.js";
export declare const planCommand: {
    name: string;
    aliases: string[];
    description: string;
    run({ args, state }: {
        args: any;
        state: any;
    }): {
        message: string;
        plan?: undefined;
    } | {
        plan: SessionPlan;
        message?: undefined;
    };
};
export declare const goalCommand: {
    name: string;
    description: string;
    run({ args, state }: {
        args: any;
        state: any;
    }): {
        message: string;
        plan?: undefined;
    } | {
        plan: SessionPlan;
        message?: undefined;
    };
};
