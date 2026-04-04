'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useChat } from '@/hooks/useChat';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { EscalationPrompt } from '@/components/chat/EscalationPrompt';
import { EditBeforeSend } from '@/components/chat/EditBeforeSend';
import { MemoryTagsPanel } from '@/components/chat/MemoryTagsPanel';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Bird, Menu, LogOut, Tag, X, Loader2 } from 'lucide-react';

export default function ChatPage() {
  const { user, loading: userLoading, signOut } = useUser();
  const router = useRouter();
  const [showSidebar, setShowSidebar] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    memoryTags,
    loading,
    initialLoading,
    showEscalationPrompt,
    pendingEscalation,
    sendMessage,
    escalateToClinic,
    dismissEscalation,
  } = useChat({
    userId: user?.id || '',
    clinicId: user?.clinic_id || undefined,
  });

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!userLoading && !user) {
      router.push('/login');
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
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-full">
            <Bird className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold">Nightingale</h1>
            <p className="text-xs text-muted-foreground">Your health assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
            className="md:hidden"
          >
            {showSidebar ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
            className="hidden md:flex"
          >
            <Tag className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto">
              {initialLoading ? (
                <div className="flex items-center justify-center h-full py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-20 px-4">
                  <div className="p-4 bg-primary/10 rounded-full w-fit mx-auto mb-4">
                    <Bird className="h-12 w-12 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Welcome to Nightingale</h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    I&apos;m here to help you with your health questions. Feel free to ask me anything,
                    and I&apos;ll do my best to assist you.
                  </p>
                  <div className="mt-6 space-y-2 text-sm text-muted-foreground">
                    <p>Try asking me:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        'What could cause a headache?',
                        'How much water should I drink?',
                        'What are symptoms of the flu?',
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => sendMessage(suggestion)}
                          className="px-3 py-1.5 bg-muted rounded-full hover:bg-muted/80 transition-colors"
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
                    <ChatBubble key={message.id} message={message} />
                  ))}
                  {loading && (
                    <div className="flex gap-3 p-4">
                      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <Bird className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="flex items-center gap-1 px-4 py-2 bg-muted rounded-2xl">
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" />
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}
                  <div ref={scrollEndRef} />
                </>
              )}
            </div>
          </div>

          {/* Escalation Prompt */}
          {showEscalationPrompt && (
            <EscalationPrompt
              onAccept={handleEscalationAccept}
              onDismiss={dismissEscalation}
            />
          )}

          {/* Chat Input */}
          <ChatInput
            onSend={sendMessage}
            disabled={loading}
            placeholder="Type your health question..."
          />
        </div>

        {/* Sidebar - Memory Tags */}
        <aside
          className={`
            ${showSidebar ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
            fixed md:relative right-0 top-0 h-full w-80 bg-card border-l
            transition-transform duration-300 ease-in-out z-40
            md:block
            ${showSidebar ? 'block' : 'hidden md:block'}
          `}
        >
          <div className="p-4 border-b md:hidden">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Health Context</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowSidebar(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <MemoryTagsPanel tags={memoryTags} className="h-full" />
        </aside>
      </div>

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
