import Link from 'next/link';
import { MessageCircle, Shield, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand/BrandMark';
import { DEMO_PROVIDER } from '@/lib/demo';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,108,93,0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(242,185,72,0.12),_transparent_28%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_100%)]">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <BrandMark />
          <div className="flex gap-3">
            <Link href="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Asia OneHealthCare at {DEMO_PROVIDER.hospitalName}
          </p>
          <h1 className="text-5xl font-bold tracking-tight mb-6">
            Patient chat that reaches a real care team
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Short AI guidance for everyday questions, then a clean handoff to {DEMO_PROVIDER.clinicianName} and the {DEMO_PROVIDER.hospitalName} team when you need a verified answer.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="gap-2">
                <MessageCircle className="h-5 w-5" />
                Start Chatting
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                I have an account
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-20 max-w-5xl mx-auto">
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Simple Chat Interface</h3>
            <p className="text-muted-foreground text-sm">
              Ask health questions naturally, like texting a friend. 
              Get quick, conversational responses.
            </p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Verified Responses</h3>
            <p className="text-muted-foreground text-sm">
              When you need certainty, escalate to your clinic and 
              get verified answers from real providers.
            </p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Memory That Learns</h3>
            <p className="text-muted-foreground text-sm">
              Your health context is remembered across conversations,
              so you don&apos;t have to repeat yourself.
            </p>
          </div>
        </div>

        <div className="mt-20 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            For Healthcare Providers
          </p>
          <Link href="/register">
            <Button variant="outline" className="gap-2">
              <Users className="h-4 w-4" />
              Join as a Clinician
            </Button>
          </Link>
        </div>
      </main>

      <footer className="container mx-auto px-4 py-8 border-t">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{DEMO_PROVIDER.providerName}</span>
          <p>
            Verified replies appear back in the same patient thread.
          </p>
        </div>
      </footer>
    </div>
  );
}
