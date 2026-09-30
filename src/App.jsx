import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import PageLoader from './components/PageLoader';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import MeetingPage from './pages/MeetingPage';
import { normalizeProfile } from './lib/profile';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) console.error('Session error:', error);
      setSession(data.session ?? null);
      setLoading(false);
    }

    loadSession();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setMeeting(null);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      if (!session?.user?.id) {
        setProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, is_allowed')
        .eq('id', session.user.id)
        .single();

      if (!mounted) return;

      if (error) {
        console.error('Profile error:', error);
        setProfile(null);
        return;
      }

      setProfile(normalizeProfile(data, session.user));
    }

    loadProfile();
    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  async function signOut() {
    await supabase.auth.signOut();
    setMeeting(null);
  }

  if (loading) return <PageLoader />;
  if (!session) return <AuthPage />;

  if (meeting) {
    return (
      <MeetingPage
        meeting={meeting}
        profile={profile}
        user={session.user}
        onLeave={() => setMeeting(null)}
      />
    );
  }

  return (
    <DashboardPage
      user={session.user}
      profile={profile}
      onEnterMeeting={setMeeting}
      onSignOut={signOut}
    />
  );
}
