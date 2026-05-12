import { redirect } from 'next/navigation';

/** Top-level `/media` redirects into Settings so the page always uses the main app shell with sidebar. */
export default function MediaRedirectPage() {
  redirect('/settings/media');
}
