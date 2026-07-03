import { redirect } from 'next/navigation';

// The HR overview hub was removed — schedule, attendance, employees, leave, and
// payroll each live in their own sidebar section. Send /hr to the primary
// schedule & attendance page so existing links and bookmarks keep working.
export default function HrIndexPage() {
  redirect('/hr/schedule');
}
