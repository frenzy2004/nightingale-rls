'use client';

import { Bird, HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEMO_BRAND_THEME, DEMO_PROVIDER } from '@/lib/demo';

interface BrandMarkProps {
  className?: string;
  compact?: boolean;
}

export function BrandMark({ className, compact = false }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className="flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm"
        style={{
          background: `linear-gradient(135deg, ${DEMO_BRAND_THEME.primary}, ${DEMO_BRAND_THEME.ink})`,
        }}
      >
        <Bird className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight text-foreground">Nightingale</span>
          {!compact && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{
                backgroundColor: DEMO_BRAND_THEME.accent,
                color: DEMO_BRAND_THEME.ink,
              }}
            >
              Demo
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <HeartPulse className="h-3.5 w-3.5" />
          <span>
            {DEMO_PROVIDER.providerName} at {DEMO_PROVIDER.hospitalName}
          </span>
        </div>
      </div>
    </div>
  );
}
