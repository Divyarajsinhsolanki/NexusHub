import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  StartMediaButton,
  useParticipants,
  useTrackToggle,
  useTracks
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import {
  Copy,
  GripHorizontal,
  Maximize2,
  Mic,
  MicOff,
  Minus,
  Minimize2,
  PhoneOff,
  RefreshCcw,
  ScreenShare,
  ScreenShareOff,
  Video,
  VideoOff,
  Volume2
} from "lucide-react";

const CALL_MEDIA_CONNECTION_MESSAGE = "Could not connect to the call media server. Verify LIVEKIT_URL points to a reachable wss:// LiveKit Cloud or self-hosted endpoint.";
const FRAME_MARGIN = 12;
const callControlButtonBaseClass = "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-sky-400 dark:focus:ring-offset-zinc-950";
const callControlButtonActiveClass = "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-sky-800 dark:bg-sky-950/70 dark:text-sky-100 dark:hover:bg-sky-900/70";
const callControlButtonMutedClass = "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
const startMediaButtonClass = "inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50";
const endCallButtonClass = "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-red-500/20 transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-zinc-950";

const getViewportSize = () => {
  if (typeof window === "undefined") {
    return { width: 1024, height: 768 };
  }

  return { width: window.innerWidth, height: window.innerHeight };
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getFrameLimits = (callType) => {
  const { width, height } = getViewportSize();
  const minWidth = Math.min(callType === "audio" ? 320 : 360, Math.max(280, width - FRAME_MARGIN * 2));
  const minHeight = Math.min(callType === "audio" ? 240 : 420, Math.max(220, height - FRAME_MARGIN * 2));
  const maxWidth = Math.max(minWidth, width - FRAME_MARGIN * 2);
  const maxHeight = Math.max(minHeight, height - FRAME_MARGIN * 2);

  return { minWidth, minHeight, maxWidth, maxHeight };
};

const clampFrame = (frame, callType) => {
  const { width: viewportWidth, height: viewportHeight } = getViewportSize();
  const { minWidth, minHeight, maxWidth, maxHeight } = getFrameLimits(callType);
  const width = clamp(frame.width || minWidth, minWidth, maxWidth);
  const height = clamp(frame.height || minHeight, minHeight, maxHeight);
  const maxX = Math.max(FRAME_MARGIN, viewportWidth - width - FRAME_MARGIN);
  const maxY = Math.max(FRAME_MARGIN, viewportHeight - height - FRAME_MARGIN);

  return {
    width,
    height,
    x: clamp(frame.x ?? maxX, FRAME_MARGIN, maxX),
    y: clamp(frame.y ?? maxY, FRAME_MARGIN, maxY)
  };
};

const getDefaultFrame = (callType) => {
  if (typeof window === "undefined") {
    return { width: 560, height: callType === "audio" ? 260 : 520, x: 24, y: 24 };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const { minWidth, minHeight, maxWidth, maxHeight } = getFrameLimits(callType);
  const width = clamp(Math.min(Math.max(viewportWidth - 24, 320), 580), minWidth, maxWidth);
  const height = callType === "audio"
    ? clamp(Math.min(Math.max(240, viewportHeight * 0.34), 300), minHeight, maxHeight)
    : clamp(Math.min(Math.max(440, viewportHeight * 0.62), 620), minHeight, maxHeight);

  return clampFrame({
    width,
    height,
    x: Math.max(12, viewportWidth - width - 20),
    y: Math.max(12, viewportHeight - height - 20)
  }, callType);
};

const friendlyConnectionError = (error) => {
  const message = error?.message || "";
  if (!message) return "Could not connect to the call media server.";

  if (/failed to fetch|signal connection|network|refused/i.test(message)) {
    return CALL_MEDIA_CONNECTION_MESSAGE;
  }

  return `Could not connect to the call media server: ${message}`;
};

const isScreenShareTrack = (trackRef) => (
  trackRef?.source === Track.Source.ScreenShare ||
  trackRef?.publication?.source === Track.Source.ScreenShare
);

const getParticipantName = (trackRef) => (
  trackRef?.participant?.name ||
  trackRef?.participant?.identity ||
  "Participant"
);

const getTrackKey = (trackRef) => [
  trackRef?.participant?.identity || "participant",
  trackRef?.source || trackRef?.publication?.source || "source",
  trackRef?.publication?.trackSid || "placeholder"
].join(":");

const getGridStyle = (tileCount) => {
  const columns = tileCount <= 1 ? 1 : tileCount <= 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(tileCount / columns));

  return {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
  };
};

const MediaToggle = ({
  source,
  label,
  enabledLabel,
  disabledLabel,
  enabledText,
  disabledText,
  EnabledIcon,
  DisabledIcon,
  captureOptions,
  onDeviceError
}) => {
  const handleDeviceError = useCallback((error) => {
    onDeviceError?.(error?.message || "Could not access the selected media device.");
  }, [onDeviceError]);

  const { buttonProps, enabled } = useTrackToggle({
    source,
    captureOptions,
    onDeviceError: handleDeviceError
  });
  const { className: liveKitClassName, ...restButtonProps } = buttonProps;
  const Icon = enabled ? EnabledIcon : DisabledIcon;

  return (
    <button
      type="button"
      {...restButtonProps}
      data-no-drag="true"
      className={`${callControlButtonBaseClass} ${enabled ? callControlButtonActiveClass : callControlButtonMutedClass} ${liveKitClassName || ""}`}
      aria-label={enabled ? enabledLabel : disabledLabel}
      title={enabled ? enabledLabel : disabledLabel}
    >
      <Icon className="h-4 w-4" />
      <span>{enabled ? enabledText || label : disabledText || label}</span>
    </button>
  );
};

const CallVideoTile = ({ trackRef, compact = false }) => {
  const participantName = getParticipantName(trackRef);
  const isScreenShare = isScreenShareTrack(trackRef);
  const hasVideoTrack = Boolean(trackRef?.publication?.track);
  const isMuted = !trackRef?.participant?.isMicrophoneEnabled;
  const initials = participantName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <div className="relative min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.95)]">
      <ParticipantTile
        trackRef={trackRef}
        disableSpeakingIndicator={false}
        className={`h-full w-full !bg-transparent [&_.lk-focus-toggle-button]:hidden [&_.lk-participant-metadata]:hidden [&_.lk-participant-placeholder]:hidden [&_video]:h-full [&_video]:w-full ${isScreenShare ? "[&_video]:object-contain" : "[&_video]:object-cover"}`}
      />

      {!hasVideoTrack && !isScreenShare && (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.28),transparent_38%),linear-gradient(135deg,#0f172a,#111827)] text-white">
          <div className="text-center">
            <div className={`${compact ? "h-11 w-11 rounded-2xl text-sm" : "h-16 w-16 rounded-3xl text-lg"} mx-auto flex items-center justify-center bg-white/12 font-semibold ring-1 ring-white/15`}>
              {initials}
            </div>
            {!compact && <p className="mt-3 text-xs font-semibold text-white/75">Camera off</p>}
          </div>
        </div>
      )}

      <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-slate-950/92 via-slate-950/55 to-transparent ${compact ? "px-2 pb-2 pt-8" : "px-3 pb-3 pt-10"}`}>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className={`flex min-w-0 items-center gap-2 rounded-full bg-white/10 text-white shadow-sm backdrop-blur-md ${compact ? "px-2 py-1" : "px-2.5 py-1.5"}`}>
            {isScreenShare ? <ScreenShare className="h-3.5 w-3.5 shrink-0" /> : <Video className="h-3.5 w-3.5 shrink-0" />}
            <span className={`${compact ? "text-[11px]" : "text-xs"} truncate font-semibold`}>
              {participantName}{isScreenShare ? "'s screen" : ""}
            </span>
          </div>
          {!isScreenShare && (
            <div className={`flex ${compact ? "h-6 w-6" : "h-7 w-7"} shrink-0 items-center justify-center rounded-full ${isMuted ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}>
              {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CallVideoStage = () => {
  const tracks = useTracks([
    { source: Track.Source.ScreenShare, withPlaceholder: false },
    { source: Track.Source.Camera, withPlaceholder: true }
  ], { onlySubscribed: false });
  const visibleTracks = [...tracks].sort((left, right) => {
    if (isScreenShareTrack(left) !== isScreenShareTrack(right)) {
      return isScreenShareTrack(left) ? -1 : 1;
    }

    if (left.participant?.isLocal !== right.participant?.isLocal) {
      return left.participant?.isLocal ? 1 : -1;
    }

    return getParticipantName(left).localeCompare(getParticipantName(right));
  });
  const screenShareTracks = visibleTracks.filter(isScreenShareTrack);
  const participantTracks = visibleTracks.filter((trackRef) => !isScreenShareTrack(trackRef));
  const mainScreenShare = screenShareTracks[0];
  const secondaryTracks = [...screenShareTracks.slice(1), ...participantTracks];

  return (
    <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.24),transparent_34%),linear-gradient(135deg,#0f172a,#111827)] p-3">
      {mainScreenShare ? (
        <div className="flex h-full min-h-0 w-full flex-col gap-2 xl:flex-row">
          <div className="min-h-0 flex-1">
            <CallVideoTile trackRef={mainScreenShare} />
          </div>
          {secondaryTracks.length > 0 && (
            <div className="flex h-28 shrink-0 gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] xl:h-full xl:w-48 xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden xl:pb-0 [&::-webkit-scrollbar]:hidden">
              {secondaryTracks.map((trackRef) => (
                <div key={getTrackKey(trackRef)} className="h-full min-w-[10rem] xl:min-h-0 xl:w-full xl:min-w-0 xl:flex-1">
                  <CallVideoTile trackRef={trackRef} compact />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : visibleTracks.length > 0 ? (
        <div className="grid h-full min-h-0 w-full gap-2" style={getGridStyle(visibleTracks.length)}>
          {visibleTracks.map((trackRef) => (
            <CallVideoTile key={getTrackKey(trackRef)} trackRef={trackRef} />
          ))}
        </div>
      ) : (
        <div className="flex h-full min-h-[12rem] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-center text-white">
          <div>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
              <Video className="h-7 w-7" />
            </div>
            <p className="mt-4 text-sm font-semibold">Waiting for video</p>
            <p className="mt-1 text-xs text-white/60">Participant video will appear here.</p>
          </div>
        </div>
      )}
    </div>
  );
};

const CallAudioStage = () => {
  const participants = useParticipants();

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-6 text-center">
      <div>
        <div className="mx-auto flex max-w-md flex-wrap justify-center gap-4">
          {participants.map((participant) => {
            const name = participant.name || participant.identity || "Participant";
            const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
            return (
              <div key={participant.identity} className="w-24">
                <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-lg font-semibold text-white shadow-lg ${participant.isSpeaking ? "bg-emerald-500 ring-4 ring-emerald-200 dark:ring-emerald-900" : "bg-gradient-to-br from-blue-500 to-sky-400"}`}>
                  {initials}
                </div>
                <p className="mt-2 truncate text-xs font-semibold">{name}{participant.isLocal ? " (You)" : ""}</p>
                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{participant.isSpeaking ? "Speaking" : "Connected"}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">Voice call in progress</p>
      </div>
    </div>
  );
};

const CallControls = ({ isAudioOnly, onLeave, onEnd, canEnd, onDeviceError }) => {
  return (
    <div className="shrink-0 border-t border-slate-100 bg-white/95 px-3 py-3 shadow-[0_-12px_35px_-28px_rgba(15,23,42,0.9)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="flex max-w-full items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <MediaToggle
            source={Track.Source.Microphone}
            label="Mic"
            enabledLabel="Turn microphone off"
            disabledLabel="Turn microphone on"
            enabledText="Mic"
            disabledText="Muted"
            EnabledIcon={Mic}
            DisabledIcon={MicOff}
            onDeviceError={onDeviceError}
          />
          {!isAudioOnly && (
            <MediaToggle
              source={Track.Source.Camera}
              label="Video"
              enabledLabel="Turn camera off"
              disabledLabel="Turn camera on"
              enabledText="Video"
              disabledText="Video Off"
              EnabledIcon={Video}
              DisabledIcon={VideoOff}
              onDeviceError={onDeviceError}
            />
          )}
          {!isAudioOnly && (
            <MediaToggle
              source={Track.Source.ScreenShare}
              captureOptions={{ audio: true, selfBrowserSurface: "include" }}
              label="Share"
              enabledLabel="Stop screen sharing"
              disabledLabel="Share screen"
              enabledText="Stop"
              disabledText="Share"
              EnabledIcon={ScreenShareOff}
              DisabledIcon={ScreenShare}
              onDeviceError={onDeviceError}
            />
          )}
          <StartMediaButton
            label="Allow media"
            className={startMediaButtonClass}
            aria-label="Allow blocked call media playback"
          />
        </div>
        <button
          type="button"
          data-no-drag="true"
          onClick={onLeave}
          className={endCallButtonClass}
          aria-label="Leave call"
          title="Leave call"
        >
          <PhoneOff className="h-4 w-4" />
          Leave
        </button>
        {canEnd && (
          <button
            type="button"
            data-no-drag="true"
            onClick={onEnd}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:bg-zinc-950 dark:text-red-300"
          >
            End for all
          </button>
        )}
      </div>
    </div>
  );
};

const CallRoom = ({ callSession, credentials, onLeave, onEnd, onRetry, onConnectionError, onConnected, initialAudio = true, initialVideo = true }) => {
  const callFrameRef = useRef(null);
  const dragStateRef = useRef(null);
  const resizeStateRef = useRef(null);
  const [connectionError, setConnectionError] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [frame, setFrame] = useState(() => getDefaultFrame(callSession?.call_type));
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [durationNow, setDurationNow] = useState(() => Date.now());

  const updateFrame = useCallback((nextFrame) => {
    setFrame((previous) => {
      const resolvedFrame = typeof nextFrame === "function" ? nextFrame(previous) : nextFrame;
      return clampFrame(resolvedFrame, callSession?.call_type);
    });
  }, [callSession?.call_type]);

  useEffect(() => {
    setConnectionError("");
    setIsConnected(false);
    setIsExpanded(false);
    setIsMinimized(false);
    setFrame(getDefaultFrame(callSession?.call_type));
  }, [callSession?.id, callSession?.call_type, credentials?.participant_token, credentials?.server_url]);

  useEffect(() => {
    const timer = window.setInterval(() => setDurationNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const handleFullscreenChange = () => {
      setIsBrowserFullscreen(document.fullscreenElement === callFrameRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleWindowResize = () => {
      updateFrame((previous) => previous);
    };

    window.addEventListener("resize", handleWindowResize);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [updateFrame]);

  useEffect(() => {
    if (!isDragging) return undefined;

    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      updateFrame({
        ...dragState.frame,
        x: dragState.frame.x + event.clientX - dragState.pointerX,
        y: dragState.frame.y + event.clientY - dragState.pointerY
      });
    };

    const stopDragging = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [isDragging, updateFrame]);

  useEffect(() => {
    if (!isResizing) return undefined;

    const handlePointerMove = (event) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      updateFrame({
        ...resizeState.frame,
        width: resizeState.frame.width + event.clientX - resizeState.pointerX,
        height: resizeState.frame.height + event.clientY - resizeState.pointerY
      });
    };

    const stopResizing = () => {
      resizeStateRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [isResizing, updateFrame]);

  useEffect(() => {
    if (!isDragging && !isResizing) return undefined;
    if (typeof document === "undefined") return undefined;

    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isDragging, isResizing]);

  const handleDragStart = useCallback((event) => {
    if (isExpanded || isBrowserFullscreen || event.button !== 0) return;

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button,a,input,textarea,select,[data-no-drag='true']")) return;

    dragStateRef.current = {
      frame,
      pointerX: event.clientX,
      pointerY: event.clientY
    };
    setIsDragging(true);
    event.preventDefault();
  }, [frame, isBrowserFullscreen, isExpanded]);

  const handleResizeStart = useCallback((event) => {
    if (isExpanded || isBrowserFullscreen || event.button !== 0) return;

    resizeStateRef.current = {
      frame,
      pointerX: event.clientX,
      pointerY: event.clientY
    };
    setIsResizing(true);
    event.preventDefault();
    event.stopPropagation();
  }, [frame, isBrowserFullscreen, isExpanded]);

  const handleToggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") {
      setIsExpanded((previous) => !previous);
      return;
    }

    if (isBrowserFullscreen && document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    const frameElement = callFrameRef.current;
    if (!frameElement?.requestFullscreen) {
      setIsExpanded(true);
      return;
    }

    try {
      await frameElement.requestFullscreen();
    } catch (_error) {
      setIsExpanded(true);
    }
  }, [isBrowserFullscreen, isExpanded]);

  const handleCopyLink = useCallback(async () => {
    if (!callSession?.share_url) return;
    try {
      await navigator.clipboard.writeText(callSession.share_url);
    } catch (_error) {
      window.prompt("Copy meeting link", callSession.share_url);
    }
  }, [callSession?.share_url]);

  const startedAt = callSession?.started_at || callSession?.created_at;
  const durationSeconds = startedAt ? Math.max(0, Math.floor((durationNow - new Date(startedAt).getTime()) / 1000)) : 0;
  const durationText = `${String(Math.floor(durationSeconds / 60)).padStart(2, "0")}:${String(durationSeconds % 60).padStart(2, "0")}`;
  const joinedCount = callSession?.participants?.filter((participant) => participant.status === "joined").length || 0;

  if (!callSession || !credentials?.server_url || !credentials?.participant_token) return null;

  const isAudioOnly = callSession.call_type === "audio";
  const statusText = connectionError
    ? "Connection failed"
    : isConnected
      ? "Connected"
      : callSession.status === "ringing"
        ? "Ringing participants"
        : "Connecting";
  const isFullView = isExpanded || isBrowserFullscreen;

  const content = (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden border border-slate-200 bg-white text-slate-900 shadow-[0_28px_80px_-34px_rgba(15,23,42,0.55)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-white ${isFullView ? "rounded-none" : "rounded-2xl"}`}>
      <div
        onPointerDown={handleDragStart}
        className={`call-room-drag-handle flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-zinc-800 ${isFullView ? "" : isDragging ? "cursor-grabbing" : "cursor-move"}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-sky-950/60 dark:text-sky-200">
            {isAudioOnly ? <Volume2 className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {isAudioOnly ? "Voice call" : "Video call"}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {statusText} · {joinedCount} joined · {durationText}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-sky-950/60 dark:text-sky-200"
            title="Copy meeting link"
            aria-label="Copy meeting link"
          >
            <Copy className="h-4 w-4" />
          </button>
          {!isFullView && (
            <button
              type="button"
              onClick={() => setIsMinimized((value) => !value)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-zinc-900 dark:text-slate-200"
              title={isMinimized ? "Restore call" : "Minimize call"}
              aria-label={isMinimized ? "Restore call" : "Minimize call"}
            >
              {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            </button>
          )}
          {!isExpanded && (
            <div className="hidden h-9 w-9 items-center justify-center rounded-xl text-slate-300 md:flex" aria-hidden="true">
              <GripHorizontal className="h-4 w-4" />
            </div>
          )}
          {connectionError && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-sky-950/60 dark:text-sky-200 dark:hover:bg-sky-900/70"
              title="Retry connection"
              aria-label="Retry connection"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-sky-950/60 dark:text-sky-200 dark:hover:bg-sky-900/70"
            title={isFullView ? "Exit full screen" : "Full screen"}
            aria-label={isFullView ? "Exit full screen" : "Full screen"}
          >
            {isFullView ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
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
        <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-950/60 dark:bg-red-950/30 dark:text-red-200">
          {connectionError}
        </div>
      )}

      <LiveKitRoom
        serverUrl={credentials.server_url}
        token={credentials.participant_token}
        connect
        audio={initialAudio}
        video={!isAudioOnly && initialVideo}
        className={`${isMinimized ? "invisible" : "flex"} min-h-0 flex-1 flex-col ${isAudioOnly ? "bg-white dark:bg-zinc-950" : "bg-slate-900"}`}
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
          <CallAudioStage />
        ) : (
          <CallVideoStage />
        )}
        <CallControls
          isAudioOnly={isAudioOnly}
          onLeave={onLeave}
          onEnd={onEnd}
          canEnd={Boolean(callSession.can_end)}
          onDeviceError={(message) => {
            setConnectionError(message);
            onConnectionError?.(message);
          }}
        />
      </LiveKitRoom>
    </div>
  );

  return (
    <div
      ref={callFrameRef}
      className={isFullView ? "fixed inset-0 z-[60] bg-white dark:bg-zinc-950" : "fixed z-[60]"}
      style={isFullView ? undefined : {
        height: isMinimized ? 76 : frame.height,
        left: 0,
        top: 0,
        transform: `translate3d(${frame.x}px, ${frame.y}px, 0)`,
        width: frame.width
      }}
    >
      {content}
      {!isFullView && !isMinimized && (
        <button
          type="button"
          data-no-drag="true"
          onPointerDown={handleResizeStart}
          className={`absolute bottom-1 right-1 z-20 inline-flex h-11 w-11 items-end justify-end rounded-br-2xl p-2 text-slate-400 transition hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-500 dark:hover:text-slate-300 dark:focus:ring-offset-zinc-950 ${isResizing ? "cursor-nwse-resize text-blue-600 dark:text-sky-300" : "cursor-nwse-resize"}`}
          aria-label="Resize call window"
          title="Resize call window"
        >
          <GripHorizontal className="h-4 w-4 -rotate-45" />
        </button>
      )}
    </div>
  );
};

export default CallRoom;
