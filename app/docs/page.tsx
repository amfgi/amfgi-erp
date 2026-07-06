import type { Metadata } from 'next';
import Link from 'next/link';
import { UserGuideShell } from '@/components/docs/UserGuideShell';
import { USER_GUIDE_PAGES } from '@/lib/docs/userGuide';

export const metadata: Metadata = {
  title: 'User Guide | AMFGI ERP',
  description: 'Module documentation for company setup, stock, customers, jobs, and suppliers.',
};

const ORDERED_PAGES = [...USER_GUIDE_PAGES].sort((a, b) => a.order - b.order);

export default function UserGuideIndexPage() {
  return (
    <UserGuideShell>
      <div className="space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="grid gap-px bg-slate-200 dark:bg-slate-800 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)]">
            <div className="bg-[radial-gradient(circle_at_15%_15%,rgba(251,191,36,0.18),transparent_34%),linear-gradient(135deg,#ffffff,#fffbeb)] p-6 sm:p-10 dark:bg-[radial-gradient(circle_at_15%_15%,rgba(251,191,36,0.15),transparent_34%),linear-gradient(135deg,#020617,#0f172a)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
                AMFGI ERP
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                How to run daily operations in AMFGI.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Start with company setup, then follow stock workflows from master data through receipt, dispatch,
                production, and control. Customer, job, and supplier guides explain how modules connect.
              </p>
            </div>
            <div className="grid bg-white p-6 dark:bg-slate-900 sm:p-8">
              <div className="grid gap-3">
                {[
                  { label: 'Guide modules', value: String(ORDERED_PAGES.length), note: 'company, stock, CRM, jobs, suppliers' },
                  { label: 'Stock topics', value: '12+', note: 'receipt, dispatch, budget, integrity, …' },
                  { label: 'Also available', value: 'API', note: 'integration reference at /docs/api' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/55"
                  >
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{item.value}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Start here</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">Module guides</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {ORDERED_PAGES.map((page) => (
              <Link
                key={page.slug}
                href={`/docs/${page.slug}`}
                className="group rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-500/40"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                  {page.eyebrow}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950 group-hover:text-amber-800 dark:text-white dark:group-hover:text-amber-300">
                  {page.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{page.description}</p>
                <span className="mt-4 inline-flex text-xs font-semibold text-slate-900 underline-offset-4 group-hover:underline dark:text-amber-300">
                  Read guide →
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Suggested learning path</h2>
          <ol className="mt-4 space-y-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
            <li>
              <strong className="font-semibold text-slate-900 dark:text-white">1. Company setup</strong> — profile,
              users, roles, and settings.
            </li>
            <li>
              <strong className="font-semibold text-slate-900 dark:text-white">2. Customers & suppliers</strong> —
              directory and sync modes.
            </li>
            <li>
              <strong className="font-semibold text-slate-900 dark:text-white">3. Jobs</strong> — parent contracts and
              variations.
            </li>
            <li>
              <strong className="font-semibold text-slate-900 dark:text-white">4. Stock</strong> — master data → receipt
              → budget → dispatch → production log → review.
            </li>
            <li>
              <strong className="font-semibold text-slate-900 dark:text-white">5. HR</strong> — schedule → attendance
              → leave → payroll preview → pay run.
            </li>
          </ol>
        </section>
      </div>
    </UserGuideShell>
  );
}
