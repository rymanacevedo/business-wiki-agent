import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { linkPage } from "../../../../../packages/wiki-links";
import { openWikiPage } from "../../../../../packages/wiki-links/open";
import { createWikiStore } from "../../../../../packages/wiki-store";
import { WikiMarkdown } from "@/app/_components/wiki-markdown";

// Pages change as Clerk Ingests: always read the store.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Clerk wiki" };

type Params = { readonly path?: string[] };

/**
 * The read-only wiki browser: any Page or Source in this deployment's
 * namespace (`WIKI_NAMESPACE`, default `demo`), the Index at /wiki.
 */
export default async function WikiPage({
  params,
}: {
  readonly params: Promise<Params>;
}) {
  const { path = [] } = await params;
  const store = createWikiStore({
    namespace: process.env.WIKI_NAMESPACE ?? "demo",
  });
  const page = await openWikiPage(store, path);
  if (!page) notFound();
  const isSource = page.path.startsWith("sources/");
  const { frontmatter, body } = isSource
    ? { frontmatter: null, body: page.body }
    : linkPage(page.body, page.path);
  // Pages without a "# " heading still get their frontmatter title.
  const title = /^#\s/m.test(body)
    ? null
    : /^title:\s*(.+)$/m.exec(frontmatter ?? "")?.[1];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <nav className="mb-6 flex items-center gap-4 text-muted-foreground text-sm">
        <Link className="hover:text-foreground" href="/wiki">
          Index
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate font-mono text-xs">{page.path}</span>
        <Link className="ml-auto hover:text-foreground" href="/s">
          Chat with Clerk
        </Link>
      </nav>
      {isSource ? (
        <section>
          <p className="mb-3 text-muted-foreground text-sm">
            Source (read-only, masked as Clerk saw it)
          </p>
          <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-4 font-mono text-sm">
            {body}
          </pre>
        </section>
      ) : (
        <article>
          {frontmatter ? (
            <details className="mb-6 rounded-md border bg-muted/40 p-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Frontmatter
              </summary>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
                {frontmatter}
              </pre>
            </details>
          ) : null}
          {title ? (
            <h1 className="mb-4 font-semibold text-3xl">{title}</h1>
          ) : null}
          <WikiMarkdown markdown={body} />
        </article>
      )}
    </main>
  );
}
