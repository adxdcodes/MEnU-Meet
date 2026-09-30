import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function ConnectionModeSwitch({ meeting, onModeChanged }) {
  const [busy, setBusy] = useState(false);
  const isHost = meeting?.host_id;

  async function changeMode(nextMode) {
    if (busy || nextMode === meeting.connection_mode) return;
    setBusy(true);

    try {
      const { data, error } = await supabase
        .from('meetings')
        .update({ connection_mode: nextMode })
        .eq('id', meeting.id)
        .eq('host_id', meeting.host_id)
        .select('connection_mode')
        .single();

      if (error) throw error;
      onModeChanged(data.connection_mode);

      const channel = supabase.channel(`meeting-mode:${meeting.id}`);
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'connection-mode',
        payload: { connection_mode: data.connection_mode },
      });
      await supabase.removeChannel(channel);
    } catch (error) {
      console.error('Connection mode update failed:', error);
      onModeChanged(meeting.connection_mode, error.message || 'Could not change connection mode.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mode-switch" aria-label="Connection type">
      <span className="mode-label">Connection</span>
      <button
        className={`mode-option ${meeting.connection_mode === 'p2p' ? 'active' : ''}`}
        disabled={busy}
        onClick={() => changeMode('p2p')}
        title="Direct browser-to-browser WebRTC"
      >
        P2P
      </button>
      <button
        className={`mode-option ${meeting.connection_mode === 'sfu' ? 'active' : ''}`}
        disabled={busy}
        onClick={() => changeMode('sfu')}
        title="LiveKit SFU"
      >
        LiveKit SFU
      </button>
    </div>
  );
}
