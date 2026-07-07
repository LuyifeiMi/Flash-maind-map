import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  dark?: boolean;
}

export function MarkdownRenderer({ content, className, dark = false }: MarkdownRendererProps) {
  return (
    <div className={cn("markdown-body", dark ? "prose-invert text-white" : "text-slate-800", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                {...props}
                children={String(children).replace(/\n$/, '')}
                style={vscDarkPlus}
                language={match[1]}
                PreTag="div"
                className="rounded-md my-2 text-sm"
              />
            ) : (
              <code {...props} className={cn("bg-slate-100 text-pink-600 px-1.5 py-0.5 rounded-md text-sm font-mono", dark && "bg-slate-800 text-pink-400", className)}>
                {children}
              </code>
            );
          },
          p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          h1: ({ children }) => <h1 className="text-xl font-bold mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-bold mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-bold mb-2">{children}</h3>,
          a: ({ children, href }) => <a href={href} className="text-indigo-500 hover:underline" target="_blank" rel="noreferrer">{children}</a>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-slate-300 pl-4 italic my-2">{children}</blockquote>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
