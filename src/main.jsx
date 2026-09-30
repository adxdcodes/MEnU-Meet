import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';
import './styles.css';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

function Auth({ onDone }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [username, setUsername] = useState(''); const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setError('');
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { username } } });
    if (result.error) setError(result.error.message); else if (mode === 'login') onDone(result.data.user);
    else setError('Account created. If email confirmation is enabled, confirm your email and then sign in.');
  }
  return <main className="center"><form className="card auth" onSubmit={submit}>
    <h1>FriendMeet</h1><p className="muted">Private meetings for up to 5 people.</p>
    {mode === 'signup' && <input placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} required/>}
    <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/>
    <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required minLength="6"/>
    {error && <div className="error">{error}</div>}
    <button>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
    <button type="button" className="link" onClick={()=>{setMode(mode==='login'?'signup':'login');setError('')}}>{mode==='login'?'Create an account':'Back to sign in'}</button>
  </form></main>
}

function Dashboard({ profile, user, onEnter }) {
  const [name,setName]=useState('Friends Hangout'); const [room,setRoom]=useState(''); const [error,setError]=useState(''); const [creating,setCreating]=useState(false);
  async function createRoom(){
    setCreating(true);setError('');
    const roomCode = crypto.randomUUID().replaceAll('-','').slice(0,8).toUpperCase();
    const {data,error} = await supabase.from('meetings').insert({room_code:roomCode,name:name.trim()||'Friends Hangout',host_id:user.id}).select().single();
    setCreating(false); if(error) setError(error.message); else onEnter(data);
  }
  async function joinRoom(){
    setError(''); const code=room.trim().toUpperCase();
    if(!code) return;
    const {data,error}=await supabase.from('meetings').select('*').eq('room_code',code).maybeSingle();
    if(error||!data){setError('Meeting not found.');return;} onEnter(data);
  }
  return <main className="dashboard"><header><div><strong>FriendMeet</strong><span className="muted"> / {profile?.username || 'User'}</span></div><button className="secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button></header>
    {!profile?.is_allowed && <div className="error banner">Your account is not allowed to use the app yet. Ask the administrator to enable access.</div>}
    <section className="grid2">
      <div className="card"><h2>Create a meeting</h2><input value={name} onChange={e=>setName(e.target.value)} placeholder="Meeting name"/><button disabled={!profile?.is_allowed||creating} onClick={createRoom}>Create meeting</button></div>
      <div className="card"><h2>Join a meeting</h2><input value={room} onChange={e=>setRoom(e.target.value)} placeholder="Room code"/><button disabled={!profile?.is_allowed} onClick={joinRoom}>Join meeting</button></div>
    </section>
    {error && <div className="error">{error}</div>}
  </main>
}

function Meeting({ meeting, user, profile, onLeave }) {
  const [token,setToken]=useState(null); const [serverUrl,setServerUrl]=useState(null); const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;
    (async()=>{
      const {data:{session}}=await supabase.auth.getSession();
      const {data,error}=await supabase.functions.invoke('livekit-token',{body:{room_id:meeting.id}});
      if(!active)return; if(error){setError(error.message);setLoading(false);return;} setToken(data.participant_token);setServerUrl(data.server_url);setLoading(false);
    })(); return ()=>{active=false};
  },[meeting.id]);
  if(error) return <main className="center"><div className="card"><h2>Unable to join</h2><p className="error">{error}</p><button onClick={onLeave}>Back</button></div></main>;
  if(loading) return <main className="center"><div className="card"><h2>Connecting…</h2><p className="muted">Preparing the secure meeting connection.</p></div></main>;
  return <div className="meeting"><div className="meetingbar"><strong>{meeting.name}</strong><span className="muted">Room {meeting.room_code}</span><button className="secondary" onClick={onLeave}>Leave</button></div>
    <LiveKitRoom token={token} serverUrl={serverUrl} connect={true} video={true} audio={true} options={{adaptiveStream:true,dynacast:true}} onDisconnected={onLeave}>
      <VideoConference /><RoomAudioRenderer />
    </LiveKitRoom>
  </div>;
}

function App(){
  const [session,setSession]=useState(null); const [profile,setProfile]=useState(null); const [meeting,setMeeting]=useState(null); const [ready,setReady]=useState(false);
  useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)}); const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return ()=>data.subscription.unsubscribe()},[]);
  useEffect(()=>{if(!session){setProfile(null);return;} supabase.from('profiles').select('*').eq('id',session.user.id).single().then(({data})=>setProfile(data))},[session]);
  if(!ready)return <main className="center"><div className="card">Loading…</div></main>;
  if(!session)return <Auth onDone={()=>{}}/>;
  if(meeting)return <Meeting meeting={meeting} user={session.user} profile={profile} onLeave={()=>setMeeting(null)}/>;
  return <Dashboard profile={profile} user={session.user} onEnter={setMeeting}/>;
}
createRoot(document.getElementById('root')).render(<App/>);
