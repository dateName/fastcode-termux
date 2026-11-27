/** Per-event soft timeout: mark the hook abandoned, keep the run alive. */
export const HOOK_TIMEOUT_SOFT = 1500;
/** Host hard timeout: SIGKILL the child host if it is still stuck. */
export const HOOK_TIMEOUT_HARD = 3000;
