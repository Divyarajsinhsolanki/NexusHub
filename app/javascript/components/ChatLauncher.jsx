import React, { useContext, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, Phone, PhoneOff, Video } from "lucide-react";
import { acknowledgeCallRing, declineCall, endCall, fetchConversations, joinCall, leaveCall, updateConversationReceipt } from "./api";
import { subscribeToUserChat } from "../lib/chatCable";
import { AuthContext } from "../context/AuthContext";
import CallRoom from "./chat/CallRoom";
import { isLiveCall } from "../utils/chatCalls";

const getCallParticipantStatus = (callSession, userId) => (
  callSession?.current_participant?.status ||
  callSession?.participants?.find((participant) => Number(participant.user_id) === Number(userId))?.status ||
  null
);

const shouldSurfaceIncomingCall = (callSession, userId) => (
  isLiveCall(callSession) &&
  Number(callSession?.initiator_id) !== Number(userId) &&
  getCallParticipantStatus(callSession, userId) === "ringing"
);

const ChatLauncher = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useContext(AuthContext);
  const [unreadCount, setUnreadCount] = useState(0);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [callCredentials, setCallCredentials] = useState(null);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [callError, setCallError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      setIncomingCall(null);
      setActiveCall(null);
      setCallCredentials(null);
      return undefined;
    }

    const load = async () => {
      try {
        const { data } = await fetchConversations({ page: 1, per_page: 1 });
        setUnreadCount(data?.meta?.unread_count || 0);
      } catch (error) {
        // ignore for logged out state
      }
    };

    load();

    const subscription = subscribeToUserChat((payload) => {
      if (!location.pathname.startsWith("/chat") && payload?.type === "message_created" && Number(payload.message?.user_id) !== Number(user?.id)) {
        updateConversationReceipt(payload.conversation_id, payload.message.id, "delivered").catch(() => {});
      }

      if (["conversation_refresh", "conversation_hidden", "conversation_deleted"].includes(payload?.type)) {
        load();
      }

      if (payload?.type === "call_ringing" || ["call_started", "call_participant_joined"].includes(payload?.type)) {
        const personalizedCall = { ...payload.call_session, can_end: Number(payload.call_session?.initiator_id) === Number(user?.id) };
        if (shouldSurfaceIncomingCall(personalizedCall, user?.id)) {
          setIncomingCall(personalizedCall);
          setActiveCall(personalizedCall);
          acknowledgeCallRing(payload.call_session.id).catch(() => {});
        }
      }

      if (["call_started", "call_participant_joined", "call_participant_left", "call_missed", "call_ended"].includes(payload?.type)) {
        const personalizedCall = { ...payload.call_session, can_end: Number(payload.call_session?.initiator_id) === Number(user?.id) };
        if (isLiveCall(personalizedCall)) {
          setActiveCall(personalizedCall);
        } else {
          setActiveCall((previous) => Number(previous?.id) === Number(payload.call_session?.id) ? null : previous);
          setIncomingCall((previous) => Number(previous?.id) === Number(payload.call_session?.id) ? null : previous);
          setCallCredentials(null);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [isAuthenticated, location.pathname, user?.id]);

  const isChatRoute = location.pathname.startsWith("/chat");
  const showGlobalCallUi = isAuthenticated && !isChatRoute;

  const handleJoinCall = async (callSession = incomingCall || activeCall) => {
    if (!callSession || isCallConnecting) return;

    try {
      setIsCallConnecting(true);
      setCallError("");
      const { data } = await joinCall(callSession.id);
      setCallCredentials({
        server_url: data.server_url,
        participant_token: data.participant_token
      });
      setIncomingCall(null);
      setActiveCall(data.call_session);
    } catch (error) {
      setCallError(error?.response?.data?.message || "Unable to join the call.");
    } finally {
      setIsCallConnecting(false);
    }
  };

  const handleDeclineCall = async () => {
    if (!incomingCall) return;

    try {
      const { data } = await declineCall(incomingCall.id);
      if (isLiveCall(data.call_session)) setActiveCall(data.call_session);
      else setActiveCall(null);
    } catch (error) {
      // Keep the launcher usable even if the call already ended elsewhere.
    } finally {
      setIncomingCall(null);
    }
  };

  const handleLeaveCall = async () => {
    if (!activeCall) return;

    try {
      await leaveCall(activeCall.id);
    } catch (error) {
      // The call may already be closed by another participant.
    } finally {
      setCallCredentials(null);
      setActiveCall(null);
      setIncomingCall(null);
    }
  };

  const handleEndCall = async () => {
    if (!activeCall) return;

    try {
      await endCall(activeCall.id, "ended");
    } catch (error) {
      // If the call has already ended, still clear the local call surface.
    } finally {
      setCallCredentials(null);
      setActiveCall(null);
      setIncomingCall(null);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <>
      {showGlobalCallUi && incomingCall && (
        <div className="fixed inset-0 z-[58] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-5 text-center shadow-[0_35px_90px_-45px_rgba(15,23,42,0.8)] dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200">
              {incomingCall.call_type === "audio" ? <Phone className="h-8 w-8" /> : <Video className="h-8 w-8" />}
            </div>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-500">Incoming call</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{incomingCall.initiator_name}</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {incomingCall.call_type === "audio" ? "Voice" : "Video"} call from chat
            </p>
            {callError && <p className="mt-4 rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-950/30 dark:text-red-200">{callError}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleDeclineCall}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-300"
              >
                <PhoneOff className="h-4 w-4" />
                Decline
              </button>
              <button
                type="button"
                onClick={() => handleJoinCall(incomingCall)}
                disabled={isCallConnecting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <Phone className="h-4 w-4" />
                {isCallConnecting ? "Joining..." : "Accept"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/chat/${incomingCall.conversation_id}`)}
              className="mt-3 text-xs font-semibold text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              Open chat thread
            </button>
          </div>
        </div>
      )}

      {showGlobalCallUi && (
        <CallRoom
          callSession={activeCall}
          credentials={callCredentials}
          onLeave={handleLeaveCall}
          onEnd={handleEndCall}
          onRetry={() => handleJoinCall(activeCall)}
          onConnectionError={(message) => setCallError(message)}
          onConnected={() => setCallError("")}
        />
      )}

      {!isChatRoute && (
        <Link to="/chat" className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-theme px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-theme/25 hover:bg-theme/90">
          <MessageCircle size={18} />
          Chat
          {unreadCount > 0 && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">{unreadCount}</span>}
        </Link>
      )}
    </>
  );
};

export default ChatLauncher;
