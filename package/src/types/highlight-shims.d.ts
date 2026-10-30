declare module "bash-parser" {
    const parse: (code: string, options?: any) => any;
    export default parse;
}

declare module "highlight.js/lib/core.js" {
    const hljs: any;
    export default hljs;
}

declare module "highlight.js/lib/languages/*.js" {
    const language: any;
    export default language;
}
