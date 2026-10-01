import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { MAIN_ROOM_CODE, getMeetingCodeFromPath, goToDashboard, goToMeeting } from './lib/routes';
import { normalizeProfile } from './lib/profile';
import PageLoader from './components/PageLoader';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import MeetingPage from './pages/MeetingPage';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [meeting, setMeeting] = useState(null);
  const [routeRoomCode, setRouteRoomCode] = useState(() => getMeetingCodeFromPath());
  const [routeError, setRouteError] = useState('');
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      setRouteRoomCode(getMeetingCodeFromPath());
      setRouteError('');
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
        goToDashboard({ replace: true });
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
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, is_allowed')
        .eq('id', session.user.id)
        .single();

      if (!mounted) return;

      if (error) {
        console.error('Profile error:', error);
        setProfile(null);
      } else {
        setProfile(normalizeProfile(data));
      }
      setProfileLoading(false);
    }

    loadProfile();
    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    let mounted = true;

    async function loadMainMeeting() {
      if (!session?.user?.id || !profile?.isAllowed) return;

      setRouteError('');
      const { data, error } = await supabase.rpc('get_main_meeting');
      if (!mounted) return;

      if (error) {
        console.error('Main meeting lookup failed:', error);
        setRouteError(error.message || 'Could not open MEnU Meet.');
        return;
      }

      const nextMeeting = Array.isArray(data) ? data[0] : data;
      if (!nextMeeting) {
        setRouteError('The MEnU Meet room is not available yet.');
        return;
      }

      if (routeRoomCode && routeRoomCode !== MAIN_ROOM_CODE) {
        setRouteError('MEnU Meet uses one private meeting room.');
      }

      // A shared /meet/MENUMEET URL opens the same single room automatically.
      if (routeRoomCode === MAIN_ROOM_CODE) setMeeting(nextMeeting);
    }

    loadMainMeeting();
    return () => {
      mounted = false;
    };
  }, [session?.user?.id, profile?.isAllowed, routeRoomCode]);

  async function joinMainMeeting() {
    const { data, error } = await supabase.rpc('get_main_meeting');
    if (error) throw error;
    const nextMeeting = Array.isArray(data) ? data[0] : data;
    if (!nextMeeting) throw new Error('The MEnU Meet room is not available yet.');
    return nextMeeting;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMeeting(null);
    goToDashboard({ replace: true });
  }

  function enterMeeting(nextMeeting) {
    setRouteError('');
    setMeeting(nextMeeting);
    goToMeeting(nextMeeting.room_code);
  }

  function leaveMeeting() {
    setMeeting(null);
    goToDashboard();
  }

  if (loading) return <PageLoader />;
  if (!session) return <AuthPage />;
  if (profileLoading) return <PageLoader />;

  if (meeting) {
    return (
      <MeetingPage
        meeting={meeting}
        profile={profile}
        user={session.user}
        onLeave={leaveMeeting}
      />
    );
  }

  return (
    <DashboardPage
      profile={profile}
      routeError={routeError}
      onEnterMeeting={enterMeeting}
      onJoin={joinMainMeeting}
      onSignOut={signOut}
    />
  );
}
