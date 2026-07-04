'use client';

import { cn } from '@/lib/utils';
import { convertGoogleDriveUrl } from '@/lib/utils/googleDriveUrl';

function employeeInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

const sizeClasses = {
  sm: 'h-9 w-9 text-xs rounded-lg',
  md: 'h-12 w-12 text-sm rounded-xl',
  lg: 'h-28 w-28 text-2xl rounded-2xl',
} as const;

export function EmployeeAvatar({
  name,
  photoUrl,
  size = 'md',
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  const src = photoUrl?.trim() ? convertGoogleDriveUrl(photoUrl.trim()) : '';

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden border border-border bg-muted font-semibold text-foreground',
        sizeClasses[size],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-emerald-500/15 to-sky-500/15">
          {employeeInitials(name)}
        </div>
      )}
    </div>
  );
}
