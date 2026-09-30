import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function getIceServers() {
  const configured = import.meta.env.VITE_WEBRTC_ICE_SERVERS;
  if (!configured) return DEFAULT_ICE_SERVERS;
  try {
    const parsed = JSON.parse(configured);
    return Array.isArray(parsed) && parsed.length
      ? parsed
      : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

function mediaError(error) {
  if (
    error?.name === "NotAllowedError" ||
    error?.name === "PermissionDeniedError"
  ) {
    return "Camera or microphone permission was denied. Allow access in your browser settings and try again.";
  }
  if (
    error?.name === "NotFoundError" ||
    error?.name === "DevicesNotFoundError"
  ) {
    return "No camera or microphone was found on this device.";
  }
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return "Your camera or microphone is already being used by another application.";
  }
  return error?.message || "Could not start your camera and microphone.";
}

export default function P2PMeeting({
  meeting,
  user,
  profile,
  onError,
  onConnected,
  onDisconnected,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const channelRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(new MediaStream());
  const pendingCandidatesRef = useRef([]);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const politeRef = useRef(false);
  const startedOfferRef = useRef(false);
  const remoteUserRef = useRef(null);
  const channelReadyRef = useRef(false);
  const pendingSignalsRef = useRef([]);
  const [status, setStatus] = useState("Preparing your camera…");
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [remotePeerCount, setRemotePeerCount] = useState(0);

  const sendSignal = useCallback(
    async (payload) => {
      const message = { from: user.id, ...payload };

      // Realtime uses REST when send() is called before the channel is
      // subscribed. Queue WebRTC signaling until the WebSocket is ready.
      if (!channelRef.current || !channelReadyRef.current) {
        pendingSignalsRef.current.push(message);
        return;
      }

      const response = await channelRef.current.send({
        type: "broadcast",
        event: "signal",
        payload: message,
      });

      if (response === "error") {
        console.warn("Supabase Realtime rejected signaling message.");
      }
    },
    [user.id],
  );

  const flushPendingSignals = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel || !channelReadyRef.current) return;

    const queued = pendingSignalsRef.current.splice(0);
    for (const payload of queued) {
      const response = await channel.send({
        type: "broadcast",
        event: "signal",
        payload,
      });

      if (response === "error") {
        console.warn("Supabase Realtime rejected queued signaling message.");
      }
    }
  }, []);

  const flushCandidates = useCallback(async () => {
    const pc = peerRef.current;
    if (!pc?.remoteDescription) return;
    const queued = pendingCandidatesRef.current.splice(0);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (error) {
        console.warn("Ignoring stale ICE candidate:", error);
      }
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    if (peerRef.current) return peerRef.current;

    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    peerRef.current = pc;
    localStreamRef.current
      ?.getTracks()
      .forEach((track) => pc.addTrack(track, localStreamRef.current));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal({ type: "ice-candidate", candidate });
    };

    pc.ontrack = ({ track, streams }) => {
      const remote = streams?.[0] || remoteStreamRef.current;
      if (
        !remoteStreamRef.current
          .getTracks()
          .some((item) => item.id === track.id)
      ) {
        remoteStreamRef.current.addTrack(track);
      }
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
      setRemoteConnected(true);
      setStatus("Connected directly");
      onConnected?.();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setRemoteConnected(true);
        setStatus("Connected directly");
        onConnected?.();
      } else if (pc.connectionState === "connecting") {
        setStatus("Connecting securely…");
      } else if (pc.connectionState === "disconnected") {
        setRemoteConnected(false);
        setStatus("Peer temporarily disconnected");
        onDisconnected?.();
      } else if (pc.connectionState === "failed") {
        setRemoteConnected(false);
        setStatus("Connection failed");
        onError?.(
          "Direct WebRTC connection failed. Add a TURN server or switch this meeting to LiveKit SFU.",
        );
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        await sendSignal({
          type: "description",
          description: pc.localDescription,
        });
      } catch (error) {
        if (pc.signalingState !== "closed")
          onError?.(
            error.message || "Could not negotiate the WebRTC connection.",
          );
      } finally {
        makingOfferRef.current = false;
      }
    };

    return pc;
  }, [onConnected, onDisconnected, onError, sendSignal]);

  const handleSignal = useCallback(
    async (payload) => {
      if (!payload || payload.from === user.id) return;
      remoteUserRef.current = payload.from;
      const pc = createPeerConnection();

      try {
        if (payload.type === "hello") return;

        if (payload.type === "description") {
          const description = payload.description;
          const isOffer = description?.type === "offer";
          const offerCollision =
            isOffer &&
            (makingOfferRef.current || pc.signalingState !== "stable");
          ignoreOfferRef.current = !politeRef.current && offerCollision;
          if (ignoreOfferRef.current) return;

          if (offerCollision && politeRef.current) {
            await pc.setLocalDescription({ type: "rollback" });
          }

          await pc.setRemoteDescription(description);
          await flushCandidates();

          if (isOffer) {
            await pc.setLocalDescription();
            await sendSignal({
              type: "description",
              description: pc.localDescription,
            });
          }
          return;
        }

        if (payload.type === "ice-candidate") {
          if (!pc.remoteDescription) {
            pendingCandidatesRef.current.push(payload.candidate);
          } else {
            await pc.addIceCandidate(payload.candidate);
          }
        }
      } catch (error) {
        if (
          payload.type === "description" &&
          payload.description?.type === "answer"
        ) {
          // A duplicate/stale answer can arrive after renegotiation. Ignore it safely.
          if (pc.signalingState === "stable") return;
        }
        if (!ignoreOfferRef.current) {
          console.error("P2P signaling error:", error);
          onError?.(error.message || "P2P signaling failed.");
        }
      }
    },
    [createPeerConnection, flushCandidates, onError, sendSignal, user.id],
  );

  useEffect(() => {
    let cancelled = false;
    let channel;

    async function start() {
      try {
        setStatus("Requesting camera and microphone…");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const lowerId = [user.id, meeting.host_id].sort()[0];
        politeRef.current = user.id !== lowerId;
        createPeerConnection();

        channel = supabase.channel(`p2p:${meeting.id}`, {
          config: {
            broadcast: { self: false, ack: true },
            presence: { key: user.id },
          },
        });
        channelRef.current = channel;
        channel.on("broadcast", { event: "signal" }, ({ payload }) =>
          handleSignal(payload),
        );
        channel.on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const peers = Object.entries(state).filter(
            ([key]) => key !== user.id,
          );
          setRemotePeerCount(peers.length);
          if (peers.length > 1) {
            setStatus("P2P supports two participants");
            onError?.(
              "P2P mode supports two participants. Switch the meeting to LiveKit SFU for more participants.",
            );
          } else if (peers.length) {
            remoteUserRef.current = peers[0][0];
            setStatus("Secure peer connection starting…");
            if (!startedOfferRef.current && !politeRef.current) {
              startedOfferRef.current = true;
              // Let onnegotiationneeded own offer creation. This avoids competing offers.
              createPeerConnection().dispatchEvent(
                new Event("negotiationneeded"),
              );
            }
          } else {
            setStatus("Waiting for the other participant…");
          }
        });

        channel.subscribe(async (subscriptionStatus) => {
          if (subscriptionStatus === "SUBSCRIBED") {
            channelReadyRef.current = true;

            await channel.track({
              username: profile?.username || "User",
              user_id: user.id,
            });

            // Flush anything generated by RTCPeerConnection before the
            // Realtime WebSocket finished joining the channel.
            await flushPendingSignals();

            await sendSignal({ type: "hello" });
            return;
          }

          channelReadyRef.current = false;
        });
      } catch (error) {
        if (!cancelled) {
          setStatus("Media unavailable");
          onError?.(mediaError(error));
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      channelReadyRef.current = false;
      pendingSignalsRef.current = [];
      channelRef.current?.untrack().catch(() => {});
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      peerRef.current?.close();
      peerRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      screenStreamRef.current = null;
      remoteStreamRef.current = new MediaStream();
    };
  }, [
    createPeerConnection,
    flushPendingSignals,
    handleSignal,
    meeting.id,
    meeting.host_id,
    onError,
    profile?.username,
    sendSignal,
    user.id,
  ]);

  function toggleMic() {
    const next = !micEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicEnabled(next);
  }

  function toggleCamera() {
    const next = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setCameraEnabled(next);
  }

  async function toggleScreenShare() {
    const videoSender = peerRef.current
      ?.getSenders()
      .find((item) => item.track?.kind === "video");
    if (!videoSender) return;

    if (sharing) {
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) await videoSender.replaceTrack(cameraTrack);
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      if (localVideoRef.current)
        localVideoRef.current.srcObject = localStreamRef.current;
      setSharing(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });
      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) return;
      await videoSender.replaceTrack(screenTrack);
      screenStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setSharing(true);

      screenTrack.onended = async () => {
        const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
        if (cameraTrack) await videoSender.replaceTrack(cameraTrack);
        screenStreamRef.current?.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
        if (localVideoRef.current)
          localVideoRef.current.srcObject = localStreamRef.current;
        setSharing(false);
      };
    } catch (error) {
      if (error?.name !== "AbortError" && error?.name !== "NotAllowedError")
        onError?.(error.message || "Could not start screen sharing.");
    }
  }

  return (
    <div className="p2p-meeting">
      <div className="p2p-statusbar">
        <span
          className={`connection-dot ${remoteConnected ? "connected" : ""}`}
        />
        <span>{status}</span>
        <span className="transport-pill">P2P WebRTC</span>
        {remotePeerCount > 1 && (
          <span className="p2p-limit">Switch to SFU</span>
        )}
      </div>

      <div className="p2p-video-grid">
        <div className="p2p-video-card local">
          <video ref={localVideoRef} autoPlay playsInline muted />
          <div className="video-overlay">
            <span>You</span>
            <span>{micEnabled ? "Mic on" : "Muted"}</span>
          </div>
          {!cameraEnabled && (
            <div className="camera-off-avatar">
              {(profile?.username || "Y").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="p2p-video-card remote">
          <video ref={remoteVideoRef} autoPlay playsInline />
          {!remoteConnected && (
            <div className="remote-placeholder">
              <div className="waiting-avatar">
                {remoteUserRef.current ? "?" : "M"}
              </div>
              <strong>Waiting for your guest</strong>
              <span>Share the meeting link to invite them.</span>
            </div>
          )}
          {remoteConnected && (
            <div className="video-overlay">
              <span>Guest</span>
              <span>Connected</span>
            </div>
          )}
        </div>
      </div>

      <div className="p2p-controls-wrap">
        <div className="p2p-controls">
          <button
            className={`media-control ${!micEnabled ? "off" : ""}`}
            onClick={toggleMic}
          >
            {micEnabled ? "Mute" : "Unmute"}
          </button>
          <button
            className={`media-control ${!cameraEnabled ? "off" : ""}`}
            onClick={toggleCamera}
          >
            {cameraEnabled ? "Camera" : "Camera off"}
          </button>
          <button
            className={`media-control ${sharing ? "active" : ""}`}
            onClick={toggleScreenShare}
          >
            {sharing ? "Stop sharing" : "Share screen"}
          </button>
        </div>
        <div className="control-hint">
          Your call is peer-to-peer. Video stays between the two browsers.
        </div>
      </div>
    </div>
  );
}
