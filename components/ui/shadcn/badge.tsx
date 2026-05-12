import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeBase =
  'inline-flex items-center rounded-md border border-transparent px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background';

const variantClass: Record<'default' | 'secondary' | 'destructive' | 'outline', string> = {
  default: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
  secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
  destructive: 'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
  outline: 'border-border bg-transparent text-foreground',
};

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: keyof typeof variantClass;
};

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return <div className={cn(badgeBase, variantClass[variant], className)} {...props} />;
}

export { Badge };
