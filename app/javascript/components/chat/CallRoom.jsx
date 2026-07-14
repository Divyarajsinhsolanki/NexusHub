import React, { useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference
} from "@livekit/components-react";
import "@livekit/components-styles";
import { PhoneOff, RefreshCcw, Volume2, Video } from "lucide-react";

const friendlyConnectionError = (error) => {
  if (!error?.message) return "Could not connect to the call media server.";

  return `Could not connect to the call media server: ${error.message}`;
};

const CallRoom = ({ callSession, credentials, onLeave, onRetry, onConnectionError, onConnected }) => {
  const [connectionError, setConnectionError] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setConnectionError("");
    setIsConnected(false);
  }, [callSession?.id, credentials?.participant_token, credentials?.server_url]);

  if (!callSession || !credentials?.server_url || !credentials?.participant_token) return null;

  const isAudioOnly = callSession.call_type === "audio";
  const statusText = connectionError
    ? "Connection failed"
    : isConnected
      ? "Connected"
      : callSession.status === "ringing"
        ? "Ringing participants"
        : "Connecting";

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-[0_28px_80px_-30px_rgba(15,23,42,0.9)] md:inset-x-auto md:right-5 md:w-[34rem]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
            {isAudioOnly ? <Volume2 className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {isAudioOnly ? "Voice call" : "Video call"}
            </p>
            <p className="truncate text-xs text-white/60">
              {statusText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connectionError && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/15"
              title="Retry connection"
              aria-label="Retry connection"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-500 text-white transition hover:bg-red-600"
            title="Leave call"
            aria-label="Leave call"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>

      {connectionError && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {connectionError}
        </div>
      )}

      <LiveKitRoom
        serverUrl={credentials.server_url}
        token={credentials.participant_token}
        connect
        audio
        video={!isAudioOnly}
        className={isAudioOnly ? "h-36 bg-slate-950" : "h-[26rem] bg-slate-950"}
        onConnected={() => {
          setIsConnected(true);
          setConnectionError("");
          onConnected?.();
        }}
        onDisconnected={() => {
          setIsConnected(false);
        }}
        onError={(error) => {
          const message = friendlyConnectionError(error);
          setIsConnected(false);
          setConnectionError(message);
          onConnectionError?.(message, error);
        }}
      >
        <RoomAudioRenderer />
        {isAudioOnly ? (
          <div className="flex h-full items-center justify-center px-5 text-center">
            <div>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white">
                <Volume2 className="h-7 w-7" />
              </div>
              <p className="mt-4 text-sm font-semibold">Voice call in progress</p>
              <p className="mt-1 text-xs text-white/55">Use the call controls to mute or leave.</p>
            </div>
          </div>
        ) : (
          <VideoConference />
        )}
      </LiveKitRoom>
    </div>
  );
};

export default CallRoom;
