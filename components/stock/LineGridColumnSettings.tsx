'use client';

import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';

export interface LineGridColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  width: number;
  minWidth?: number;
  maxWidth?: number;
}

interface LineGridColumnSettingsProps {
  columns: LineGridColumnConfig[];
  onToggle: (key: string) => void;
  onMove: (key: string, direction: 'left' | 'right') => void;
  /** Icon-only trigger for compact grid chrome (default: text "Columns" button). */
  trigger?: 'label' | 'icon';
}

export default function LineGridColumnSettings({
  columns,
  onToggle,
  onMove,
  trigger = 'label',
}: LineGridColumnSettingsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === 'icon' ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Column settings"
          >
            <Settings2 className="size-3.5" aria-hidden />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm">
            Columns
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="flex max-h-[min(70vh,24rem)] w-80 flex-col overflow-hidden p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Grid Settings
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain p-3">
          {columns.map((column, index) => (
            <div key={column.key} className="rounded-md border border-border p-2">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={column.visible}
                    onChange={() => onToggle(column.key)}
                    className="size-3.5 accent-primary"
                  />
                  <span>{column.label}</span>
                </label>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onMove(column.key, 'left')}
                    disabled={index === 0}
                    className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(column.key, 'right')}
                    disabled={index === columns.length - 1}
                    className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Right
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
