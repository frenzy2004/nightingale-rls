'use client';

import { startTransition, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useChat } from '@/hooks/useChat';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatModeToggle, type ChatMode } from '@/components/chat/ChatModeToggle';
import { EscalationPrompt } from '@/components/chat/EscalationPrompt';
import { EditBeforeSend } from '@/components/chat/EditBeforeSend';
import { MemoryTagsPanel } from '@/components/chat/MemoryTagsPanel';
import { HighRiskBanner } from '@/components/chat/HighRiskBanner';
import { CareStatusTracker } from '@/components/chat/CareStatusTracker';
import { PatientSafetyFooter } from '@/components/chat/PatientSafetyFooter';
import { BrandMark } from '@/components/brand/BrandMark';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bird, ChevronLeft, ChevronRight, Menu, LogOut, X, Loader2 } from 'lucide-react';
import { DEMO_PROVIDER } from '@/lib/demo';

export default function ChatPage() {
  const { user, loading: userLoading, signOut } = useUser();
  const router = useRouter();
  const [showSidebar, setShowSidebar] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('text');
  const [autoPlayMessageId, setAutoPlayMessageId] = useState<string | null>(null);
  const chatScrollViewportRef = useRef<HTMLDivElement>(null);
  const autoplayReadyRef = useRef(false);
  const lastPlayableMessageIdRef = useRef<string | null>(null);

  const {
    messages,
    memoryTags,
    patientProfile,
    loading,
    initialLoading,
    showEscalationPrompt,
    pendingEscalation,
    riskAssessment,
    careStatus,
    sendMessage,
    sendVoiceMessage,
    sendImageMessage,
    sendProviderAction,
    sendAppointmentSelection,
    escalateToClinic,
    dismissEscalation,
  } = useChat({
    userId: user?.id || '',
    clinicId: user?.clinic_id || undefined,
  });

  useEffect(() => {
    const chatScrollViewport = chatScrollViewportRef.current;
    if (!chatScrollViewport) {
      return;
    }

    chatScrollViewport.scrollTo({
      top: chatScrollViewport.scrollHeight,
      behavior: initialLoading ? 'auto' : 'smooth',
    });
  }, [messages, initialLoading]);

  useEffect(() => {
    if (initialLoading) {
      return;
    }

    const latestPlayableMessage = [...messages]
      .reverse()
      .find((message) => message.sender !== 'patient');

    if (!autoplayReadyRef.current) {
      autoplayReadyRef.current = true;
      lastPlayableMessageIdRef.current = latestPlayableMessage?.id || null;
      return;
    }

    if (!latestPlayableMessage || latestPlayableMessage.id === lastPlayableMessageIdRef.current) {
      return;
    }

    lastPlayableMessageIdRef.current = latestPlayableMessage.id;
    startTransition(() => {
      setAutoPlayMessageId(latestPlayableMessage.id);
    });
  }, [initialLoading, messages]);

  useEffect(() => {
    if (!userLoading && !user) {
      router.push('/login');
    }
    if (!userLoading && user?.role === 'clinician') {
      router.push('/clinic/triage');
    }
  }, [user, userLoading, router]);

  const handleEscalationAccept = () => {
    setShowEditModal(true);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (userLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(15,108,93,0.12),_transparent_40%),linear-gradient(180deg,#f8fbfb_0%,#fdfdfc_100%)]">
      {/* Header */}
      <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <BrandMark compact />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden md:inline-flex border-emerald-200 bg-emerald-50 text-emerald-700">
            {DEMO_PROVIDER.clinicianName}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
            className="md:hidden"
            aria-label={showSidebar ? 'Hide patient context' : 'Show patient context'}
          >
            {showSidebar ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsContextOpen((value) => !value)}
            className="hidden md:flex"
            aria-label={isContextOpen ? 'Collapse patient context' : 'Expand patient context'}
          >
            {isContextOpen ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Main Chat Area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={chatScrollViewportRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div className="pb-4">
              <ChatModeToggle mode={chatMode} onChange={setChatMode} />
              <HighRiskBanner riskAssessment={riskAssessment} />
              <CareStatusTracker escalation={careStatus} />

              <div className="mx-auto w-full max-w-3xl">
                {initialLoading ? (
                  <div className="flex h-full items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="px-4 py-10 text-center md:py-12">
                    <div className="mx-auto mb-4 w-fit rounded-full bg-primary/10 p-4">
                      <Bird className="h-12 w-12 text-primary" />
                    </div>
                    <h2 className="mb-2 text-xl font-semibold">Welcome to Nightingale</h2>
                    <p className="mx-auto max-w-md text-muted-foreground">
                      Short, careful answers for everyday questions, with a direct path to the {DEMO_PROVIDER.hospitalName} care team when you want a verified reply.
                    </p>
                    <div className="mt-6 space-y-2 text-sm text-muted-foreground">
                      <p>Try asking me:</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {[
                          'How should I get ready for my biopsy?',
                          'What should I watch for after treatment?',
                          'Can I send this to my care team?',
                        ].map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => sendMessage(suggestion)}
                            className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-muted/80"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => (
                      <ChatBubble
                        key={message.id}
                        message={message}
                        onQuickAction={sendProviderAction}
                        onAppointmentSelect={sendAppointmentSelection}
                        shouldAutoPlayAudio={message.id === autoPlayMessageId}
                      />
                    ))}
                    {loading && (
                      <div className="flex gap-3 p-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
                          <Bird className="h-4 w-4 text-purple-600" />
                        </div>
                        <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-2">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0.2s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0.4s]" />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Escalation Prompt */}
          {showEscalationPrompt && (
            <EscalationPrompt
              onAccept={handleEscalationAccept}
              onDismiss={dismissEscalation}
              riskAssessment={pendingEscalation?.riskAssessment || riskAssessment}
            />
          )}

          {/* Chat Input */}
          <ChatInput
            mode={chatMode}
            onSend={sendMessage}
            onSendVoice={sendVoiceMessage}
            onSendImage={sendImageMessage}
            disabled={loading}
            placeholder={
              chatMode === 'text'
                ? 'Type your question for Nightingale...'
                : chatMode === 'voice'
                ? 'Tap the mic or type a quick follow-up...'
                : 'Add a note about the image if helpful...'
            }
          />
        </div>

        <aside
          className={`
            fixed right-0 top-0 z-40 h-full w-[24rem] max-w-[calc(100vw-1rem)] border-l bg-card
            transition-transform duration-300 ease-in-out md:hidden
            ${showSidebar ? 'translate-x-0' : 'translate-x-full'}
          `}
        >
          <div className="p-4 border-b md:hidden">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Patient Context</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowSidebar(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <MemoryTagsPanel tags={memoryTags} profile={patientProfile} className="h-full" />
        </aside>

        <aside
          className={`
            hidden min-h-0 border-l border-slate-200/80 bg-card transition-[width,border-color] duration-300 ease-in-out md:block
            ${isContextOpen ? 'w-[24rem]' : 'w-0 border-l-transparent'}
          `}
        >
          <div
            className={`
              h-full overflow-hidden transition-opacity duration-200
              ${isContextOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}
            `}
          >
            <MemoryTagsPanel tags={memoryTags} profile={patientProfile} className="h-full" />
          </div>
        </aside>
      </div>

      <PatientSafetyFooter />

      {/* Edit Before Send Modal */}
      {pendingEscalation && (
        <EditBeforeSend
          open={showEditModal}
          onOpenChange={setShowEditModal}
          originalQuestion={pendingEscalation.question}
          aiSummary={pendingEscalation.aiSummary}
          contextSnapshot={pendingEscalation.contextSnapshot}
          onSend={escalateToClinic}
        />
      )}
    </div>
  );
}
