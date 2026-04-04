'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@/types';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async (userId: string): Promise<User | null> => {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) {
        console.error('Error fetching user profile:', error.message);
        return null;
      }
      // rpc returns array for SETOF — grab first row
      if (Array.isArray(data)) return data[0] || null;
      return data;
    };

    const fetchUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          if (!cancelled) {
            setUser(null);
            setLoading(false);
          }
          return;
        }

        const profile = await fetchProfile(session.user.id);

        if (!cancelled) {
          setUser(profile);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching user:', err);
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: string, session: { user?: { id: string } } | null) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        if (!cancelled) setUser(profile);
      } else {
        if (!cancelled) setUser(null);
      }
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return { user, loading, signOut };
}
