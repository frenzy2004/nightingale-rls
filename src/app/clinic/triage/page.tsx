'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase/client';
import { TriageCard } from '@/components/clinic/TriageCard';
import { BrandMark } from '@/components/brand/BrandMark';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LogOut,
  Inbox,
  Clock,
  CheckCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { Escalation } from '@/types';
import { DEMO_PROVIDER, getClinicEscalationLabel } from '@/lib/demo';

type FilterStatus = 'all' | 'pending' | 'in_progress' | 'resolved';

export default function TriagePage() {
  const { user, loading: userLoading, signOut } = useUser();
  const router = useRouter();
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const supabase = createClient();

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'clinician' && user.role !== 'admin') {
      router.push('/chat');
    }
  }, [user, userLoading, router]);

  const fetchEscalations = async () => {
    if (!user?.clinic_id) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/escalate?clinicId=${user.clinic_id}`);
      const data = await response.json();
      setEscalations(data.escalations || []);
    } catch (error) {
      console.error('Error fetching escalations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.clinic_id) {
      fetchEscalations();
    }
  }, [user?.clinic_id, filter]);

  useEffect(() => {
    if (!user?.clinic_id) return;

    const channel = supabase
      .channel('escalations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'escalations',
          filter: `clinic_id=eq.${user.clinic_id}`,
        },
        () => {
          fetchEscalations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.clinic_id, supabase]);

  const handleSelectEscalation = (escalation: Escalation) => {
    router.push(`/clinic/reply/${escalation.id}`);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const filterCounts = {
    all: escalations.length,
    pending: escalations.filter((e) => e.status === 'pending').length,
    in_progress: escalations.filter((e) => e.status === 'in_progress').length,
    resolved: escalations.filter((e) => e.status === 'resolved').length,
  };

  const filteredEscalations =
    filter === 'all'
      ? escalations
      : escalations.filter((e) => e.status === filter);

  if (userLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6fbfb_0%,#ffffff_100%)]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <BrandMark compact />
          <div className="hidden md:block border-l pl-3">
            <p className="text-sm font-medium text-slate-900">{DEMO_PROVIDER.hospitalName} Queue</p>
            <p className="text-xs text-muted-foreground">Provider: {DEMO_PROVIDER.clinicianName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchEscalations}>
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-700">
            {DEMO_PROVIDER.providerName}
          </Badge>
          <Badge variant="outline">
            {DEMO_PROVIDER.hospitalName}
          </Badge>
          <Badge variant="outline">
            Mixed urgency demo queue
          </Badge>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pending')}
            className="gap-2"
          >
            <Clock className="h-4 w-4" />
            Pending
            {filterCounts.pending > 0 && (
              <Badge variant="secondary" className="ml-1">
                {filterCounts.pending}
              </Badge>
            )}
          </Button>
          <Button
            variant={filter === 'in_progress' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('in_progress')}
            className="gap-2"
          >
            <Inbox className="h-4 w-4" />
            In Progress
            {filterCounts.in_progress > 0 && (
              <Badge variant="secondary" className="ml-1">
                {filterCounts.in_progress}
              </Badge>
            )}
          </Button>
          <Button
            variant={filter === 'resolved' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('resolved')}
            className="gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            Resolved
          </Button>
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
        </div>

        {/* Escalation List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredEscalations.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
            <Inbox className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-1 font-medium">No {getClinicEscalationLabel(filter as Exclude<FilterStatus, 'all'>) || filter} items right now</h3>
            <p className="text-sm text-muted-foreground">
              The demo queue is empty for this filter. Switch tabs or create a fresh escalation from the patient chat to refill it.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-4">
              {filteredEscalations.map((escalation) => (
                <TriageCard
                  key={escalation.id}
                  escalation={escalation as Escalation & {
                    patient?: { id: string; full_name: string; email: string };
                    urgency_score?: number;
                    latest_reply?: { clinician_name?: string; final_reply?: string; sent_at?: string } | null;
                  }}
                  onSelect={() => handleSelectEscalation(escalation)}
                  onOpenPatient={() => router.push(`/clinic/patients/${escalation.patient_id}`)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
