'use client';

import { ShieldAlert } from 'lucide-react';
import { PATIENT_SAFETY_FOOTER } from '@/lib/demo';

export function PatientSafetyFooter() {
  return (
    <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
      <div className="mx-auto flex max-w-5xl items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
        <p>{PATIENT_SAFETY_FOOTER}</p>
      </div>
    </div>
  );
}
