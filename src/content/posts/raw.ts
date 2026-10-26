/**
 * Raw markdown of the local MDX posts, for plain-text outputs such as
 * llms-full.txt. Server-only: import it from server routes, not components.
 * `virtual:posts-raw` is provided by the posts-raw plugin in vite.config.ts.
 */
import rawPosts from 'virtual:posts-raw';

/** Post body without the `export const meta = {...};` header. */
export function getLocalPostMarkdown(slug: string, locale: string): string {
  const raw =
    rawPosts[`${slug}.${locale}.mdx`] ?? rawPosts[`${slug}.en.mdx`] ?? '';
  return raw.replace(/^export const meta = \{[\s\S]*?\n\};\n/, '').trim();
}
