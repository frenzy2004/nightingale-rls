'use client';

import { AlertTriangle } from 'lucide-react';
import type { RiskAssessment } from '@/types';

interface HighRiskBannerProps {
  riskAssessment: RiskAssessment | null;
}

export function HighRiskBanner({ riskAssessment }: HighRiskBannerProps) {
  if (!riskAssessment || riskAssessment.level !== 'high') {
    return null;
  }

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
        <div>
          <p className="font-medium">Urgent symptom language detected</p>
          <p className="mt-1 text-red-800">
            {riskAssessment.summary} If breathing worsens, heavy bleeding starts, or you feel faint, go to the nearest emergency department or dial 999.
          </p>
        </div>
      </div>
    </div>
  );
}
