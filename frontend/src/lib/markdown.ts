import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className', 'style', 'aria-hidden'],
    pre:  [...(defaultSchema.attributes?.pre  ?? []), 'className'],
    div:  [...(defaultSchema.attributes?.div  ?? []), 'className'],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeHighlight, { detect: true, ignoreMissing: true })
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeStringify);

export async function renderMarkdown(source: string): Promise<string> {
  const result = await processor.process(source);
  return String(result);
}
