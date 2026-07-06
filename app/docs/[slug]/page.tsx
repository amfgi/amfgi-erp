import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { UserGuidePageView } from '@/components/docs/UserGuideContent';
import { UserGuideShell } from '@/components/docs/UserGuideShell';
import { getUserGuidePage, USER_GUIDE_PAGES } from '@/lib/docs/userGuide';

type GuidePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return USER_GUIDE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getUserGuidePage(slug);
  if (!page) {
    return { title: 'Guide not found | AMFGI ERP' };
  }
  return {
    title: `${page.title} | AMFGI User Guide`,
    description: page.description,
  };
}

export default async function UserGuideSlugPage({ params }: GuidePageProps) {
  const { slug } = await params;
  const page = getUserGuidePage(slug);
  if (!page) notFound();

  return (
    <UserGuideShell activeSlug={slug}>
      <UserGuidePageView page={page} />
    </UserGuideShell>
  );
}
