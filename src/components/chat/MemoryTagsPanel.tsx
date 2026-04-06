'use client';

import { format } from 'date-fns';
import {
  AlertTriangle,
  Apple,
  ClipboardList,
  HeartHandshake,
  Pill,
  ShieldAlert,
  Tag,
  UserRoundSearch,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  buildPatientContextSections,
  PATIENT_CONTEXT_SECTION_ORDER,
  type PatientContextItemStatus,
  type PatientContextSectionKey,
} from '@/lib/patient-context';
import type { MemoryTag, PatientProfile } from '@/types';

interface MemoryTagsPanelProps {
  tags: MemoryTag[];
  profile?: PatientProfile | null;
  className?: string;
  showPanelChrome?: boolean;
  showEmptySections?: boolean;
}

const sectionMeta: Record<
  PatientContextSectionKey,
  {
    label: string;
    code: string;
    icon: typeof ClipboardList;
    headerClass: string;
    iconClass: string;
  }
> = {
  clinical_history: {
    label: 'Clinical History',
    code: 'CH',
    icon: ClipboardList,
    headerClass: 'bg-emerald-50/80 border-emerald-100',
    iconClass: 'bg-emerald-100 text-emerald-700',
  },
  family_history: {
    label: 'Family History',
    code: 'FH',
    icon: Users,
    headerClass: 'bg-sky-50/80 border-sky-100',
    iconClass: 'bg-sky-100 text-sky-700',
  },
  psychosocial_history: {
    label: 'Psychosocial History',
    code: 'PSH',
    icon: HeartHandshake,
    headerClass: 'bg-violet-50/80 border-violet-100',
    iconClass: 'bg-violet-100 text-violet-700',
  },
  risk_factors: {
    label: 'Risk Factors',
    code: 'RF',
    icon: ShieldAlert,
    headerClass: 'bg-amber-50/80 border-amber-100',
    iconClass: 'bg-amber-100 text-amber-700',
  },
  medication_history: {
    label: 'Medication History',
    code: 'M',
    icon: Pill,
    headerClass: 'bg-teal-50/80 border-teal-100',
    iconClass: 'bg-teal-100 text-teal-700',
  },
  allergies: {
    label: 'Allergies',
    code: 'A',
    icon: AlertTriangle,
    headerClass: 'bg-rose-50/80 border-rose-100',
    iconClass: 'bg-rose-100 text-rose-700',
  },
  food_allergies: {
    label: 'Food Allergies',
    code: 'FA',
    icon: Apple,
    headerClass: 'bg-orange-50/80 border-orange-100',
    iconClass: 'bg-orange-100 text-orange-700',
  },
  considerations: {
    label: 'Considerations',
    code: 'C',
    icon: UserRoundSearch,
    headerClass: 'bg-slate-100/90 border-slate-200',
    iconClass: 'bg-slate-200 text-slate-700',
  },
};

const statusMeta: Record<
  PatientContextItemStatus,
  { label: string; className: string }
> = {
  active: {
    label: 'active',
    className: 'bg-emerald-600 text-white hover:bg-emerald-600',
  },
  stopped: {
    label: 'stopped',
    className: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  },
  resolved: {
    label: 'resolved',
    className: 'bg-sky-100 text-sky-700 hover:bg-sky-100',
  },
  flagged: {
    label: 'flagged',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  },
  profile: {
    label: 'charted',
    className: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
  },
};

function formatTagLabel(tag: string): string {
  return tag.replace(/^#/, '#');
}

export function MemoryTagsPanel({
  tags,
  profile,
  className,
  showPanelChrome = true,
  showEmptySections = true,
}: MemoryTagsPanelProps) {
  const populatedSections = buildPatientContextSections(tags, profile);
  const sectionMap = new Map(populatedSections.map((section) => [section.key, section.items]));
  const sections = PATIENT_CONTEXT_SECTION_ORDER.map((sectionKey) => ({
    key: sectionKey,
    items: sectionMap.get(sectionKey) || [],
  })).filter((section) => showEmptySections || section.items.length > 0);
  const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);

  if (totalItems === 0) {
    return (
      <div className={cn('p-5 text-center text-muted-foreground', className)}>
        <Tag className="mx-auto mb-3 h-8 w-8 opacity-50" />
        <p className="text-sm font-medium">No patient context yet</p>
        <p className="mt-1 text-xs">
          EMR-style context sections will appear here as Nightingale learns from the chat.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="space-y-3 p-4">
        {showPanelChrome && (
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-slate-600" />
              <h3 className="font-medium text-slate-900">Patient Context</h3>
              <Badge variant="secondary" className="ml-auto bg-slate-100 text-slate-700">
                {totalItems} items
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Organized into EMR-style sections so the recent chat memory feels closer to a chart summary.
            </p>
          </div>
        )}

        {sections.map((section) => {
          const meta = sectionMeta[section.key];
          const SectionIcon = meta.icon;

          return (
            <section
              key={section.key}
              className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm"
            >
              <div
                className={cn(
                  'flex items-center gap-3 border-b px-3 py-2.5',
                  meta.headerClass
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full',
                    meta.iconClass
                  )}
                >
                  <SectionIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">{meta.label}</h4>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {meta.code}
                    </span>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="ml-auto bg-white/80 text-slate-700 shadow-sm"
                >
                  {section.items.length}
                </Badge>
              </div>

              <div className="space-y-2 p-3">
                {section.items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-3 text-xs text-slate-500">
                    No charted items in this section yet.
                  </div>
                ) : (
                  section.items.map((item) => {
                    const status = statusMeta[item.status];

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5',
                          item.status === 'flagged' && 'border-amber-200 bg-amber-50/70'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-5 text-slate-900">
                              {item.value}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.tags.map((tag) => (
                                <Badge
                                  key={`${item.id}-${tag}`}
                                  variant="outline"
                                  className="rounded-full border-slate-200 bg-white text-[11px] text-slate-600"
                                >
                                  {formatTagLabel(tag)}
                                </Badge>
                              ))}
                              {item.source === 'patient_profile' && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-teal-200 bg-teal-50 text-[11px] text-teal-700"
                                >
                                  EMR
                                </Badge>
                              )}
                              {item.authority === 'clinician_verified' && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-orange-200 bg-orange-50 text-[11px] text-orange-700"
                                >
                                  Verified
                                </Badge>
                              )}
                            </div>
                            {item.updatedAt && (
                              <p className="mt-2 text-[11px] text-slate-500">
                                Updated {format(new Date(item.updatedAt), 'MMM d')}
                              </p>
                            )}
                          </div>
                          <Badge className={cn('rounded-full px-2.5 text-xs font-medium', status.className)}>
                            {status.label}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </ScrollArea>
  );
}
