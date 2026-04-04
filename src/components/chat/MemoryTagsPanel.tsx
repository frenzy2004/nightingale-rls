'use client';

import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tag, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import type { MemoryTag } from '@/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface MemoryTagsPanelProps {
  tags: MemoryTag[];
  className?: string;
}

const statusIcons = {
  active: CheckCircle,
  stopped: XCircle,
  resolved: CheckCircle,
  flagged: AlertTriangle,
};

const statusColors = {
  active: 'text-green-600',
  stopped: 'text-gray-500',
  resolved: 'text-blue-600',
  flagged: 'text-amber-600',
};

export function MemoryTagsPanel({ tags, className }: MemoryTagsPanelProps) {
  const groupedTags = tags.reduce((acc, tag) => {
    const category = tag.tags[0] || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(tag);
    return acc;
  }, {} as Record<string, MemoryTag[]>);

  if (tags.length === 0) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No health context yet</p>
        <p className="text-xs">Your health information will appear here as you chat</p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4" />
          <h3 className="font-medium">Health Context</h3>
          <Badge variant="secondary" className="ml-auto">
            {tags.length} items
          </Badge>
        </div>
        
        <Separator />

        {Object.entries(groupedTags).map(([category, categoryTags]) => (
          <div key={category} className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {category.replace('#', '')}
            </h4>
            <div className="space-y-2">
              {categoryTags.map((tag) => {
                const StatusIcon = statusIcons[tag.status];
                return (
                  <div
                    key={tag.id}
                    className={cn(
                      'p-2 rounded-lg border bg-card',
                      tag.status === 'flagged' && 'border-amber-200 bg-amber-50 dark:bg-amber-900/20'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <StatusIcon
                        className={cn('h-4 w-4 mt-0.5 flex-shrink-0', statusColors[tag.status])}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{tag.value}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{format(new Date(tag.updated_at), 'MMM d, yyyy')}</span>
                          {tag.authority === 'clinician_verified' && (
                            <Badge variant="outline" className="text-xs py-0 px-1">
                              Verified
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant={tag.status === 'active' ? 'default' : 'secondary'}
                        className="text-xs flex-shrink-0"
                      >
                        {tag.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
