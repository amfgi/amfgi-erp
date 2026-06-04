'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { cn } from '@/lib/utils';

type DirectoryListPaginationProps = {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  pageStart: number;
  pageEnd: number;
  pageSizeOptions: readonly number[];
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
  className?: string;
};

function normalizePageSize(value: number, options: readonly number[]) {
  if (!Number.isFinite(value) || value <= 0) return options[0] ?? 10;
  const allowed = options as readonly number[];
  if (allowed.includes(value)) return value;
  return allowed.reduce((closest, option) =>
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest,
  );
}

export default function DirectoryListPagination({
  page,
  pageSize,
  totalPages,
  total,
  pageStart,
  pageEnd,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  className,
}: DirectoryListPaginationProps) {
  const [pageSizeInput, setPageSizeInput] = useState(String(pageSize));

  useEffect(() => {
    setPageSizeInput(String(pageSize));
  }, [pageSize]);

  if (total === 0) return null;

  const showingFrom = pageStart + 1;
  const showingTo = pageEnd;
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  const commitPageSize = () => {
    const parsed = Number.parseInt(pageSizeInput, 10);
    const next = normalizePageSize(parsed, pageSizeOptions);
    setPageSizeInput(String(next));
    if (next !== pageSize) onPageSizeChange(next);
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground',
        className,
      )}
    >
      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          disabled={!canGoPrev}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-[7rem] text-center font-semibold tabular-nums text-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          disabled={!canGoNext}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2">
          <span className="shrink-0">Per page</span>
          <Input
            type="number"
            min={pageSizeOptions[0]}
            max={pageSizeOptions[pageSizeOptions.length - 1]}
            value={pageSizeInput}
            onChange={(event) => setPageSizeInput(event.target.value)}
            onBlur={commitPageSize}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitPageSize();
              }
            }}
            className="h-8 w-16 text-center text-xs tabular-nums"
            aria-label="Items per page"
          />
        </label>
        <span className="tabular-nums">
          Showing <strong className="text-foreground">{showingFrom}</strong>–<strong className="text-foreground">{showingTo}</strong> of{' '}
          <strong className="text-foreground">{total}</strong>
        </span>
      </div>
    </div>
  );
}
