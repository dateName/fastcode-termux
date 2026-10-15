/**
 * SKILL.md parser. Skills follow Anthropic's Agent Skills convention:
 *
 *   ---
 *   name: my-skill
 *   description: ...
 *   ---
 *   <markdown body>
 *
 * We accept both `---` and `+++` fences and tolerate missing frontmatter
 * (treating the first H1 + paragraph as a fallback name/description).
 */
export declare function parseSkill(source: any, fallbackName: any): {
    name: any;
    description: any;
    body: any;
    frontmatter: {};
};
