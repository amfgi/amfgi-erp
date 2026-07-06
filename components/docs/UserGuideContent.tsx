import Link from 'next/link';
import type { UserGuideBlock, UserGuidePage, UserGuideSection } from '@/lib/docs/userGuide';
import { USER_GUIDE_BY_SLUG } from '@/lib/docs/userGuide';

function GuideBlock({ block }: { block: UserGuideBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">{block.text}</p>;
    case 'list':
      return (
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600 dark:text-slate-300">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="space-y-4">
          {block.items.map((item, index) => (
            <li key={item.title} className="flex gap-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-amber-300 dark:text-slate-950">
                {index + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-slate-950 dark:text-white">{item.title}</p>
                <p className="mt-1 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      );
    case 'callout': {
      const styles =
        block.variant === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100'
          : block.variant === 'tip'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'
            : 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100';
      return (
        <div className={`rounded-2xl border p-4 ${styles}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">{block.title}</p>
          <p className="mt-2 text-sm leading-6">{block.body}</p>
        </div>
      );
    }
    default:
      return null;
  }
}

function GuideSection({ section }: { section: UserGuideSection }) {
  return (
    <section id={section.id} className="scroll-mt-28">
      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{section.title}</h2>
      <div className="mt-4 space-y-4">
        {section.blocks.map((block, index) => (
          <GuideBlock key={`${section.id}-${index}`} block={block} />
        ))}
      </div>
    </section>
  );
}

export function UserGuidePageView({ page }: { page: UserGuidePage }) {
  const related =
    page.relatedSlugs
      ?.map((slug) => USER_GUIDE_BY_SLUG[slug])
      .filter((entry): entry is UserGuidePage => Boolean(entry)) ?? [];

  return (
    <article className="space-y-8">
      <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
          {page.eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
          {page.title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">{page.description}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={page.appHref}
            className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 dark:bg-amber-300 dark:text-slate-950 dark:hover:bg-amber-200"
          >
            Open in app
          </Link>
          <a
            href="#on-this-page"
            className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-amber-300 hover:text-amber-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-amber-500 dark:hover:text-amber-300"
          >
            On this page
          </a>
        </div>
      </header>

      {page.sections.length > 1 ? (
        <nav
          id="on-this-page"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">On this page</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {page.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-amber-300 hover:text-amber-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-amber-500 dark:hover:text-amber-300"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="space-y-10 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        {page.sections.map((section) => (
          <GuideSection key={section.id} section={section} />
        ))}
      </div>

      {related.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Related guides</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {related.map((relatedPage) => (
              <Link
                key={relatedPage.slug}
                href={`/docs/${relatedPage.slug}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-amber-300 hover:bg-amber-50/50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/5"
              >
                <p className="text-sm font-semibold text-slate-950 dark:text-white">{relatedPage.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{relatedPage.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
