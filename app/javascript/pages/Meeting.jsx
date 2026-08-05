import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Copy, LogIn, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import CallRoom from "../components/chat/CallRoom";
import { endCall, fetchMeeting, joinMeeting, leaveCall } from "../components/api";
import { subscribeToCall } from "../lib/chatCable";

const liveStatuses = new Set(["ringing", "active"]);

const Meeting = () => {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const [callSession, setCallSession] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const loadMeeting = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const { data } = await fetchMeeting(publicId);
      setCallSession(data.call_session);
      setCameraEnabled(data.call_session?.call_type === "video");
    } catch (requestError) {
      setError(requestError?.response?.status === 404 ? "This meeting link is invalid." : "Unable to load this meeting.");
    } finally {
      setLoading(false);
    }
  }, [publicId]);

  useEffect(() => {
    loadMeeting();
  }, [loadMeeting]);

  useEffect(() => {
    if (!credentials || !publicId) return undefined;

    const subscription = subscribeToCall(publicId, (payload) => {
      if (!payload?.call_session) return;
      setCallSession((previous) => ({
        ...payload.call_session,
        can_end: previous?.can_end || false
      }));
      if (!liveStatuses.has(payload.call_session.status)) setCredentials(null);
    });
    return () => subscription.unsubscribe();
  }, [credentials, publicId]);

  const join = async () => {
    try {
      setJoining(true);
      setError("");
      const { data } = await joinMeeting(publicId);
      setCallSession(data.call_session);
      setCredentials({ server_url: data.server_url, participant_token: data.participant_token });
    } catch (requestError) {
      setError(requestError?.response?.status === 410
        ? "This meeting has ended."
        : requestError?.response?.data?.message || "Unable to join this meeting.");
    } finally {
      setJoining(false);
    }
  };

  const leave = async () => {
    if (!callSession) return;
    try {
      await leaveCall(callSession.id);
    } finally {
      setCredentials(null);
      loadMeeting();
    }
  };

  const endForEveryone = async () => {
    if (!callSession?.can_end) return;
    try {
      const { data } = await endCall(callSession.id, "ended");
      setCallSession(data.call_session);
    } finally {
      setCredentials(null);
    }
  };

  const copyLink = async () => {
    const link = callSession?.share_url || window.location.href;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link);
    } catch (_error) {
      window.prompt("Copy meeting link", link);
    }
  };

  if (credentials) {
    return (
      <div className="min-h-[calc(100dvh-5rem)] bg-slate-950">
        <CallRoom
          callSession={callSession}
          credentials={credentials}
          initialAudio={microphoneEnabled}
          initialVideo={cameraEnabled}
          onLeave={leave}
          onEnd={endForEveryone}
          onRetry={join}
          onConnectionError={(message) => setError(message)}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] items-center justify-center bg-[radial-gradient(circle_at_top,#1e3a8a_0%,#0f172a_38%,#020617_100%)] p-4 text-white">
      <div className="w-full max-w-xl rounded-[30px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        {loading ? (
          <p className="py-16 text-center text-sm text-slate-300">Preparing meeting…</p>
        ) : error && !callSession ? (
          <div className="py-10 text-center">
            <PhoneOff className="mx-auto h-12 w-12 text-red-300" />
            <h1 className="mt-5 text-2xl font-semibold">Meeting unavailable</h1>
            <p className="mt-2 text-sm text-slate-300">{error}</p>
            <button type="button" onClick={() => navigate("/chat")} className="mt-6 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950">Open chat</button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Nexus Hub meeting</p>
                <h1 className="mt-2 text-3xl font-semibold">{callSession?.call_type === "audio" ? "Voice call" : "Video call"}</h1>
                <p className="mt-2 text-sm text-slate-300">Hosted by {callSession?.initiator_name}</p>
              </div>
              <button type="button" onClick={copyLink} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-slate-100 hover:bg-white/15" aria-label="Copy meeting link">
                <Copy className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sky-500/20 text-2xl font-bold text-sky-100">
                {callSession?.initiator_name?.split(/\s+/).map((part) => part[0]).slice(0, 2).join("") || "NH"}
              </div>
              <p className="mt-4 text-sm font-semibold">Ready to join?</p>
              <p className="mt-1 text-xs text-slate-400">Choose your starting media settings.</p>
              <div className="mt-5 flex justify-center gap-3">
                <button type="button" onClick={() => setMicrophoneEnabled((value) => !value)} className={`flex h-12 w-12 items-center justify-center rounded-full ${microphoneEnabled ? "bg-sky-500" : "bg-red-500"}`} aria-label={microphoneEnabled ? "Turn microphone off" : "Turn microphone on"}>
                  {microphoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </button>
                {callSession?.call_type === "video" && (
                  <button type="button" onClick={() => setCameraEnabled((value) => !value)} className={`flex h-12 w-12 items-center justify-center rounded-full ${cameraEnabled ? "bg-sky-500" : "bg-red-500"}`} aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}>
                    {cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </button>
                )}
              </div>
            </div>

            {error && <p className="mt-4 rounded-xl bg-red-500/15 px-3 py-2 text-center text-sm text-red-200">{error}</p>}
            {!liveStatuses.has(callSession?.status) ? (
              <p className="mt-6 text-center text-sm font-semibold text-amber-200">This meeting has ended.</p>
            ) : (
              <button type="button" onClick={join} disabled={joining} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 py-3 font-semibold text-white hover:bg-sky-400 disabled:opacity-60">
                <LogIn className="h-5 w-5" />
                {joining ? "Joining…" : "Join meeting"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Meeting;
