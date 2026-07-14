import React, { useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, formatDistanceToNow, isSameDay, isThisYear, isToday, isYesterday } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiArrowLeft,
  FiBellOff,
  FiCheck,
  FiClock,
  FiDownload,
  FiEdit,
  FiFileText,
  FiHash,
  FiImage,
  FiInfo,
  FiLayers,
  FiMessageSquare,
  FiMoreVertical,
  FiPaperclip,
  FiPhone,
  FiPhoneCall,
  FiPhoneOff,
  FiSearch,
  FiSend,
  FiTrash2,
  FiUploadCloud,
  FiWifiOff,
  FiUsers,
  FiVideo,
  FiX,
  FiZap
} from "react-icons/fi";
import {
  SchedulerAPI,
  addMessageReaction,
  acknowledgeCallRing,
  createConversation,
  createCall,
  declineCall,
  deleteConversation,
  deleteConversationForEveryone,
  endCall as endCallSession,
  fetchConversation,
  fetchConversationMessages,
  fetchConversationSummary,
  fetchConversations,
  getUsers,
  joinCall,
  leaveCall,
  muteConversation,
  removeMessageReaction,
  sendMessage,
  startDirectConversation,
  unmuteConversation
} from "../components/api";
import { AuthContext } from "../context/AuthContext";
import CallRoom from "../components/chat/CallRoom";
import { sendToConversation, subscribeToCableStatus, subscribeToConversationChat, subscribeToUserChat } from "../lib/chatCable";
import {
  applyComposerEntity,
  getComposerEntityQuery,
  getPreferredUserMentionHandle,
  getTaskReferenceKey,
  getUserMentionAliases,
  resolveChatMessageText,
  tokenizeChatMessage
} from "../utils/chatMentions";
import { isLiveCall, mergeCallIntoConversationGroups } from "../utils/chatCalls";

const REACTION_EMOJIS = ["👍", "❤️", "🎉"];
const CONVERSATION_FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "direct", label: "Direct" },
  { id: "group", label: "Groups" }
];
const NEW_CHAT_MODES = [
  { id: "direct", label: "Direct" },
  { id: "group", label: "Group" }
];
const MUTE_OPTIONS = [
  { id: "1h", label: "Mute 1 hour" },
  { id: "8h", label: "Mute 8 hours" },
  { id: "1w", label: "Mute 1 week" },
  { id: "forever", label: "Mute forever" }
];
const CONVERSATIONS_PAGE_SIZE = 30;
const escapeRegExp = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const splitConversationList = (items = []) => {
  const direct = [];
  const group = [];

  items.forEach((conversation) => {
    if (conversation.conversation_type === "direct") direct.push(conversation);
    else group.push(conversation);
  });

  return { direct, group };
};

const getConversationSortValue = (conversation) => {
  const value = conversation?.updated_at || conversation?.last_message_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const mergeConversationGroups = (previous, nextItems, replace = false) => {
  if (replace) return splitConversationList(nextItems);

  const conversationsById = new Map();

  [...(previous.direct || []), ...(previous.group || [])].forEach((conversation) => {
    conversationsById.set(Number(conversation.id), conversation);
  });

  nextItems.forEach((conversation) => {
    conversationsById.set(Number(conversation.id), conversation);
  });

  return splitConversationList(
    Array.from(conversationsById.values()).sort((left, right) => (
      getConversationSortValue(right) - getConversationSortValue(left)
    ))
  );
};

const removeConversationFromGroups = (previous, conversationId) => ({
  direct: (previous.direct || []).filter((conversation) => Number(conversation.id) !== Number(conversationId)),
  group: (previous.group || []).filter((conversation) => Number(conversation.id) !== Number(conversationId))
});

const mergeConversationSummary = (conversation, summary) => {
  if (!conversation) return summary;
  if (!summary) return conversation;

  return {
    ...conversation,
    ...summary,
    messages: conversation.messages || summary.messages
  };
};

const normalizeConversationResponse = (payload) => {
  if (Array.isArray(payload)) {
    return { conversations: payload, meta: null };
  }

  return {
    conversations: Array.isArray(payload?.data) ? payload.data : [],
    meta: payload?.meta || null
  };
};

const getFullUserName = (person) => {
  const fullName = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
  return person?.name || fullName || person?.email || "Unknown";
};

const getConversationOtherParticipant = (conversation, currentUserId) => (
  conversation?.participants?.find((participant) => Number(participant.id) !== Number(currentUserId)) || null
);

const getConversationDisplayName = (conversation, currentUserId) => {
  if (!conversation) return "";
  if (conversation.conversation_type === "direct") {
    return getConversationOtherParticipant(conversation, currentUserId)?.name || conversation.title || "Direct conversation";
  }

  return conversation.title || "Untitled group";
};

const getConversationDisplayImage = (conversation, currentUserId) => {
  if (conversation?.conversation_type !== "direct") return null;
  return getConversationOtherParticipant(conversation, currentUserId)?.profile_picture || null;
};

const formatConversationTime = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "d MMM");
};

const formatDayLabel = (value) => {
  const date = new Date(value);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, isThisYear(date) ? "EEEE, MMM d" : "MMM d, yyyy");
};

const formatParticipantStatus = (participant, currentUserId) => {
  if (Number(participant?.id) === Number(currentUserId)) return "You";
  if (participant?.online) return "Online";
  if (participant?.last_seen_at) return `Last seen ${formatDistanceToNow(new Date(participant.last_seen_at), { addSuffix: true })}`;
  if (!participant?.last_read_at) return "No recent read receipt";
  return `Read ${formatDistanceToNow(new Date(participant.last_read_at), { addSuffix: true })}`;
};

const messageMatchesQuery = (message, query, mentionLookups) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const attachmentText = (message.attachments || [])
    .map((attachment) => `${attachment.filename || ""} ${attachment.content_type || ""}`)
    .join(" ")
    .toLowerCase();
  const resolvedMessageText = [
    message.body,
    resolveChatMessageText(message.body || "", mentionLookups),
    tokenizeChatMessage(message.body || "", mentionLookups)
      .map((segment) => segment.searchText || segment.text)
      .join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return [
    resolvedMessageText,
    message.user_name,
    attachmentText
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
};

const groupMessagesByDay = (messages) => {
  const groups = [];

  messages.forEach((message) => {
    const dateKey = format(new Date(message.created_at), "yyyy-MM-dd");
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.dateKey !== dateKey) {
      groups.push({
        dateKey,
        label: formatDayLabel(message.created_at),
        messages: [message]
      });
      return;
    }

    lastGroup.messages.push(message);
  });

  return groups;
};

const getAttachmentKindLabel = (contentType = "") => {
  if (contentType.startsWith("image/")) return "Image";
  if (contentType.includes("pdf")) return "PDF";
  if (contentType.includes("sheet")) return "Spreadsheet";
  if (contentType.includes("presentation")) return "Presentation";
  if (contentType.includes("word") || contentType.includes("document")) return "Document";
  return "File";
};


const formatFileSize = (bytes) => {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return "";

  const units = ["B", "KB", "MB", "GB"];
  let size = Number(bytes);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
};

const getFileKindLabel = (file) => {
  const contentType = file?.type || file?.content_type || "";

  if (contentType.startsWith("image/")) return "Image";
  if (contentType.startsWith("video/")) return "Video";

  return getAttachmentKindLabel(contentType);
};

const HighlightText = ({ text = "", query }) => {
  if (!text) return null;
  if (!query.trim()) return <>{text}</>;

  const normalizedQuery = query.trim().toLowerCase();
  const matcher = new RegExp(`(${escapeRegExp(query.trim())})`, "ig");
  const parts = text.split(matcher);

  return (
    <>
      {parts.map((part, index) => (
        part.toLowerCase() === normalizedQuery ? (
          <mark key={`${part}-${index}`} className="rounded bg-amber-200/80 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        )
      ))}
    </>
  );
};

const getTaskNavigationTarget = (task) => {
  if (!task) return null;

  if (task.task_url) {
    return {
      type: "external",
      href: task.task_url
    };
  }

  const projectId = task.project_id || task.sprint?.project_id;

  if (projectId) {
    return {
      type: "internal",
      to: {
        pathname: `/projects/${projectId}/dashboard`,
        search: "?tab=todo"
      },
      state: { focusTaskId: task.id || task.task_id }
    };
  }

  return {
    type: "internal",
    to: "/worklog",
    state: { focusTaskId: task.id || task.task_id }
  };
};

const MentionText = ({ text, query }) => (
  <span className="whitespace-pre-wrap break-words">
    <HighlightText text={text} query={query} />
  </span>
);

const RichMessageText = ({ text = "", isMe, searchQuery, mentionLookups }) => {
  const segments = tokenizeChatMessage(text, mentionLookups);
  const baseTagClass = isMe
    ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
    : "border-slate-200/90 bg-slate-100/90 text-slate-800 hover:bg-slate-200/80 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-slate-100 dark:hover:bg-zinc-700/80";

  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-6">
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          return <HighlightText key={`${segment.kind}-${index}`} text={segment.text} query={searchQuery} />;
        }

        if (segment.kind === "user") {
          return (
            <Link
              key={`${segment.kind}-${segment.raw}-${index}`}
              to={`/profile/${segment.user.id}`}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.92em] font-semibold transition ${baseTagClass}`}
              title={segment.user.email || segment.text}
            >
              <MentionText text={segment.text} query={searchQuery} />
            </Link>
          );
        }

        const taskTarget = getTaskNavigationTarget(segment.task);

        if (taskTarget?.type === "external") {
          return (
            <a
              key={`${segment.kind}-${segment.raw}-${index}`}
              href={taskTarget.href}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.92em] font-semibold transition ${baseTagClass}`}
              title={segment.task.title || segment.text}
            >
              <MentionText text={segment.text} query={searchQuery} />
            </a>
          );
        }

        return (
          <Link
            key={`${segment.kind}-${segment.raw}-${index}`}
            to={taskTarget?.to || "/worklog"}
            state={taskTarget?.state}
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.92em] font-semibold transition ${baseTagClass}`}
            title={segment.task.title || segment.text}
          >
            <MentionText text={segment.text} query={searchQuery} />
          </Link>
        );
      })}
    </div>
  );
};

const Avatar = ({ name, src, size = "md", className = "" }) => {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-11 w-11 text-sm",
    lg: "h-14 w-14 text-base",
    xl: "h-20 w-20 text-xl"
  };
  const colors = [
    "from-sky-500 to-blue-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
    "from-indigo-500 to-cyan-600"
  ];

  const currentSizeClass = sizeClasses[size] || sizeClasses.md;
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;

  if (src && src !== "null") {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover ring-2 ring-white/90 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.7)] ${currentSizeClass} ${className}`}
      loading="lazy" />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-br ${colors[colorIndex]} font-bold text-white ring-2 ring-white/90 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.7)] ${currentSizeClass} ${className}`}
    >
      {initial}
    </div>
  );
};

const StatCard = ({ icon, label, value, accentClass }) => (
  <div className="rounded-2xl border border-white/60 bg-white/70 p-3 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70">
    <div className="flex items-center justify-between gap-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${accentClass}`}>
        {icon}
      </div>
      <span className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</span>
    </div>
    <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
      {label}
    </p>
  </div>
);

const ConversationItem = ({ conversation, currentUserId, isActive, searchQuery, previewText, onSelect, onHide, onDeleteForEveryone, onMute, onUnmute }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isUnread = conversation.unread_count > 0;
  const isDirect = conversation.conversation_type === "direct";
  const displayName = getConversationDisplayName(conversation, currentUserId);
  const displayImage = getConversationDisplayImage(conversation, currentUserId);
  const subtitle = isDirect ? "DM" : `${conversation.participants?.length || 0} members`;
  const conversationPreview = previewText || (isDirect ? "No messages yet" : "Create a room that keeps the whole group aligned");
  const Item = onSelect ? "button" : Link;
  const itemProps = onSelect
    ? { type: "button", onClick: () => onSelect(conversation.id) }
    : { to: `/chat/${conversation.id}` };

  return (
    <div
      className={`group relative flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors ${
        isActive
          ? "border-slate-900 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
          : "border-transparent bg-transparent text-slate-700 hover:bg-white/80 dark:text-slate-200 dark:hover:bg-zinc-900/80"
      }`}
    >
      <Item
        {...itemProps}
        className={`flex min-w-0 flex-1 items-center gap-2 text-left ${onSelect ? "w-full" : ""}`}
        onClick={(event) => {
          setIsMenuOpen(false);
          itemProps.onClick?.(event);
        }}
      >
        <div className="shrink-0">
          {isDirect ? (
            <Avatar name={displayName} src={displayImage} size="sm" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-cyan-50 text-sky-700 ring-2 ring-white/90 dark:from-sky-950/60 dark:to-cyan-950/40 dark:text-sky-200">
              <FiUsers className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className={`truncate text-[13px] font-semibold ${isActive ? "" : "text-slate-900 dark:text-white"}`}>
              <HighlightText text={displayName} query={searchQuery} />
            </p>
            {isUnread && !isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
            {conversation.muted && !isActive && <FiBellOff className="h-3 w-3 shrink-0 text-slate-400" title="Muted" />}
            <span className={`shrink-0 text-[10px] ${isActive ? "opacity-70" : "text-slate-400 dark:text-slate-500"}`}>
              {formatConversationTime(conversation.updated_at)}
            </span>
          </div>

          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <span className={`shrink-0 text-[10px] uppercase ${isActive ? "opacity-70" : "text-slate-400 dark:text-slate-500"}`}>
              {subtitle}
            </span>
            <p className={`truncate text-[11px] leading-4 ${isActive ? "opacity-80" : isUnread ? "font-semibold text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>
              <HighlightText text={conversationPreview} query={searchQuery} />
            </p>
          </div>
        </div>
      </Item>

      {isUnread && (
        <span className={`flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${isActive ? "bg-white text-slate-950 dark:bg-slate-950 dark:text-white" : "bg-slate-950 text-white dark:bg-white dark:text-slate-950"}`}>
          {conversation.unread_count}
        </span>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsMenuOpen((previous) => !previous);
        }}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 transition group-hover:opacity-100 ${isMenuOpen ? "opacity-100" : ""} ${
          isActive ? "hover:bg-white/15 dark:hover:bg-slate-950/10" : "hover:bg-slate-100 dark:hover:bg-zinc-800"
        }`}
        title="Conversation actions"
      >
        <FiMoreVertical className="h-3.5 w-3.5" />
      </button>

      {isMenuOpen && (
        <div className="absolute right-2 top-9 z-30 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-slate-700 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-100">
          {conversation.muted ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsMenuOpen(false);
                onUnmute?.(conversation);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-zinc-800"
            >
              <FiBellOff className="h-3.5 w-3.5" />
              Unmute
            </button>
          ) : (
            MUTE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsMenuOpen(false);
                  onMute?.(conversation, option.id);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-zinc-800"
              >
                <FiBellOff className="h-3.5 w-3.5" />
                {option.label}
              </button>
            ))
          )}
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsMenuOpen(false);
              onHide?.(conversation);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-zinc-800"
          >
            <FiTrash2 className="h-3.5 w-3.5" />
            Hide for me
          </button>
          {conversation.can_delete_for_everyone && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsMenuOpen(false);
                onDeleteForEveryone?.(conversation);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              <FiTrash2 className="h-3.5 w-3.5" />
              Delete for everyone
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const MessageAttachmentCard = ({ attachment, isMe, searchQuery }) => {
  const isImage = attachment.content_type?.startsWith("image/");
  const isVideo = attachment.content_type?.startsWith("video/");
  const downloadUrl = attachment.download_url || attachment.url;
  const fileSize = formatFileSize(attachment.byte_size);
  const containerClass = isMe
    ? "border-white/20 bg-white/10 text-white"
    : "border-slate-200/80 bg-slate-50/80 text-slate-700 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-slate-200";
  const metaTextClass = isMe ? "text-white/70" : "text-slate-400 dark:text-slate-500";
  const downloadClass = isMe
    ? "bg-white/15 text-white hover:bg-white/25"
    : "bg-white/95 text-slate-700 hover:bg-white dark:bg-zinc-800/95 dark:text-slate-100 dark:hover:bg-zinc-700";

  if (isImage || isVideo) {
    return (
      <div className={`group/attachment relative overflow-hidden rounded-2xl border ${containerClass}`}>
        <a href={attachment.url} target="_blank" rel="noreferrer" className="block" title={`Open ${attachment.filename}`}>
          {isImage ? (
            <img src={attachment.url} alt={attachment.filename} className="h-44 w-full object-cover" loading="lazy" />
          ) : (
            <video src={attachment.url} className="h-44 w-full bg-slate-950 object-cover" controls preload="metadata" />
          )}
        </a>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent p-3 text-white">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-white/80">
            {isImage ? <FiImage className="h-3.5 w-3.5" /> : <FiVideo className="h-3.5 w-3.5" />}
            {isImage ? "Image" : "Video"}
            {fileSize && <span>{fileSize}</span>}
          </div>
          <p className="mt-1 truncate pr-10 text-xs font-medium">
            <HighlightText text={attachment.filename} query={searchQuery} />
          </p>
        </div>

        <a
          href={downloadUrl}
          download={attachment.filename}
          className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full shadow-lg backdrop-blur ${downloadClass}`}
          title={`Download ${attachment.filename}`}
          aria-label={`Download ${attachment.filename}`}
        >
          <FiDownload className="h-4 w-4" />
        </a>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition hover:-translate-y-0.5 ${containerClass}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isMe ? "bg-white/10" : "bg-white text-slate-600 dark:bg-zinc-800 dark:text-slate-200"}`}>
        <FiFileText className="h-5 w-5" />
      </div>

      <a href={attachment.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1" title={`Open ${attachment.filename}`}>
        <p className="truncate text-sm font-medium">
          <HighlightText text={attachment.filename} query={searchQuery} />
        </p>
        <p className={`mt-1 text-[11px] uppercase tracking-[0.22em] ${metaTextClass}`}>
          {[getAttachmentKindLabel(attachment.content_type), fileSize].filter(Boolean).join(" · ")}
        </p>
      </a>

      <a
        href={downloadUrl}
        download={attachment.filename}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl transition ${downloadClass}`}
        title={`Download ${attachment.filename}`}
        aria-label={`Download ${attachment.filename}`}
      >
        <FiDownload className="h-4 w-4" />
      </a>
    </div>
  );
};

const MessageBubble = ({ message, isMe, showAvatar, onToggleReaction, participants, searchQuery, mentionLookups }) => {
  const timeString = format(new Date(message.created_at), "h:mm a");
  const reactions = message.reactions || {};
  const reactedEmojis = message.reacted_emojis || [];
  const seenBy = (participants || []).filter((participant) => (
    Number(participant.id) !== Number(message.user_id) &&
    participant.last_read_at &&
    new Date(participant.last_read_at) >= new Date(message.created_at)
  ));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group/bubble flex w-full ${isMe ? "justify-end" : "justify-start"}`}
    >
      <div className={`flex max-w-[92%] gap-2 md:max-w-[74%] ${isMe ? "flex-row-reverse" : "flex-row"}`}>
        {!isMe && (
          <div className="flex w-8 shrink-0 items-end justify-center">
            {showAvatar ? <Avatar name={message.user_name} src={message.user_profile_picture} size="sm" /> : <div className="h-8 w-8" />}
          </div>
        )}

        <div className={`relative flex flex-col ${isMe ? "items-end" : "items-start"}`}>
          {!isMe && showAvatar && (
            <span className="mb-0.5 ml-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
              {message.user_name}
            </span>
          )}

          <div
            className={`relative overflow-hidden rounded-[20px] border px-3.5 py-2 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.5)] ${
              isMe
                ? "border-transparent bg-[linear-gradient(135deg,rgba(15,23,42,1),rgba(30,41,59,0.92))] text-white"
                : "border-white/80 bg-white/92 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-slate-200"
            } ${searchQuery.trim() ? "ring-2 ring-amber-300/60" : ""}`}
          >
            {message.body && <RichMessageText text={message.body} isMe={isMe} searchQuery={searchQuery} mentionLookups={mentionLookups} />}

            {message.attachments?.length > 0 && (
              <div className={`grid gap-2 ${message.body ? "mt-3" : ""} ${message.attachments.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
                {message.attachments.map((attachment) => (
                  <MessageAttachmentCard
                    key={attachment.id}
                    attachment={attachment}
                    isMe={isMe}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            )}
          </div>

          <div className={`relative z-10 flex flex-wrap items-center gap-1 px-1 ${isMe ? "-mt-1.5 justify-end pr-2" : "-mt-1.5 pl-2"}`}>
            {REACTION_EMOJIS.map((emoji) => {
              const count = reactions[emoji] || 0;
              const isActive = reactedEmojis.includes(emoji);
              if (count === 0) return null;

              return (
                <button
                  key={`${message.id}-${emoji}`}
                  type="button"
                  onClick={() => onToggleReaction(message.id, emoji, isActive)}
                  className={`inline-flex items-center gap-1 rounded-full border bg-clip-padding px-2 py-0.5 shadow-sm backdrop-blur text-[10px] font-medium transition ${
                    isActive
                      ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                      : "border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 dark:border-zinc-700 dark:bg-zinc-800/85 dark:text-slate-300"
                  }`}
                >
                  <span>{emoji}</span>
                  <span>{count}</span>
                </button>
              );
            })}
          </div>

          <div className={`pointer-events-none absolute -top-7 z-20 opacity-0 transition-all duration-150 group-hover/bubble:pointer-events-auto group-hover/bubble:opacity-100 ${isMe ? "right-0" : "left-0"}`}>
            <div className="flex items-center gap-1 rounded-full border border-white/70 bg-white/92 p-1 shadow-xl backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
              {REACTION_EMOJIS.map((emoji) => {
                const isActive = reactedEmojis.includes(emoji);
                return (
                  <button
                    key={`${message.id}-picker-${emoji}`}
                    type="button"
                    onClick={() => onToggleReaction(message.id, emoji, isActive)}
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition-transform hover:scale-125 ${isActive ? "bg-amber-100 dark:bg-amber-900/40" : "hover:bg-slate-100 dark:hover:bg-zinc-800"}`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-0.5 flex items-center gap-2 px-1 text-[11px] text-slate-400 dark:text-slate-500">
            <span>{timeString}</span>
            {isMe && (
              <span className={`inline-flex items-center gap-1 ${seenBy.length > 0 ? "text-emerald-500" : ""}`}>
                <FiCheck className="h-3.5 w-3.5" />
                {seenBy.length > 0 && <FiCheck className="-ml-1 h-3.5 w-3.5" />}
                {seenBy.length > 0 && (
                  <span className="font-medium">
                    {seenBy.length === 1 ? `Seen by ${seenBy[0].name}` : `Seen by ${seenBy.length}`}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const MentionSuggestions = ({ suggestions, activeIndex, onSelect }) => {
  if (!suggestions.length) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_45px_-34px_rgba(15,23,42,0.35)] dark:border-zinc-700 dark:bg-zinc-900">
      <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400 dark:border-zinc-800 dark:text-slate-500">
        {suggestions[0]?.trigger === "#" ? "Tasks" : "People"}
      </div>

      <div className="max-h-72 overflow-y-auto py-1">
        {suggestions.map((suggestion, index) => {
          const isActive = index === activeIndex;

          return (
            <button
              key={`${suggestion.trigger}-${suggestion.id}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(suggestion)}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                isActive
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-zinc-800"
              }`}
            >
              {suggestion.trigger === "@" ? (
                <Avatar name={suggestion.label} src={suggestion.profilePicture} size="sm" />
              ) : (
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${
                  isActive
                    ? "bg-white/10 text-white dark:bg-slate-100 dark:text-slate-950"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                }`}>
                  <FiHash className="h-4 w-4" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${isActive ? "text-current" : "text-slate-900 dark:text-white"}`}>
                  {suggestion.label}
                </p>
                <p className={`mt-1 truncate text-xs ${isActive ? "text-white/70 dark:text-slate-600" : "text-slate-500 dark:text-slate-400"}`}>
                  {suggestion.description}
                </p>
              </div>

              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                isActive
                  ? "bg-white/10 text-white dark:bg-slate-100 dark:text-slate-950"
                  : "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-slate-300"
              }`}>
                {suggestion.insertText}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const Chat = ({ embedded = false, initialConversationId = null }) => {
  const { conversationId: routeConversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [embeddedConversationId, setEmbeddedConversationId] = useState(initialConversationId);
  const conversationId = embedded ? embeddedConversationId : routeConversationId;

  const messageListRef = useRef(null);
  const fileInputRef = useRef(null);
  const composerTextareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const conversationLoadTokenRef = useRef(0);
  const conversationCacheRef = useRef({});
  const allConversationsRef = useRef([]);
  const skipNextMessageAutoScrollRef = useRef(false);
  const callLeaveInFlightRef = useRef(false);
  const ringtoneTimerRef = useRef(null);
  const ringtoneAudioContextRef = useRef(null);

  const [conversations, setConversations] = useState({ direct: [], group: [] });
  const [conversationListMeta, setConversationListMeta] = useState(null);
  const [isConversationListLoading, setIsConversationListLoading] = useState(false);
  const [isConversationListLoadingMore, setIsConversationListLoadingMore] = useState(false);
  const [activeConversation, setActiveConversation] = useState(null);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [messagePageMeta, setMessagePageMeta] = useState(null);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [messageBody, setMessageBody] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [showInfo, setShowInfo] = useState(false);
  const [isThreadActionsOpen, setIsThreadActionsOpen] = useState(false);
  const [cableStatus, setCableStatus] = useState("connected");
  const [composerSelection, setComposerSelection] = useState({ start: 0, end: 0 });
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  const [sideSearchQuery, setSideSearchQuery] = useState("");
  const [conversationFilter, setConversationFilter] = useState("all");
  const [isThreadSearchOpen, setIsThreadSearchOpen] = useState(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");

  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatMode, setNewChatMode] = useState("direct");
  const [newChatStep, setNewChatStep] = useState("select");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [callCredentials, setCallCredentials] = useState(null);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [callError, setCallError] = useState("");

  useEffect(() => {
    if (embedded) setEmbeddedConversationId(initialConversationId);
  }, [embedded, initialConversationId]);

  const openConversation = useCallback((id) => {
    if (!id) return;
    if (embedded) {
      setEmbeddedConversationId(String(id));
      return;
    }
    navigate(`/chat/${id}`);
  }, [embedded, navigate]);

  const deferredSideSearchQuery = useDeferredValue(sideSearchQuery);
  const deferredThreadSearchQuery = useDeferredValue(threadSearchQuery);
  const deferredUserSearchTerm = useDeferredValue(searchTerm);

  const allConversations = useMemo(
    () => [...conversations.direct, ...conversations.group],
    [conversations]
  );
  useEffect(() => {
    allConversationsRef.current = allConversations;
  }, [allConversations]);
  const totalConversationCount = conversationListMeta?.total_count ?? allConversations.length;
  const conversationCountLabel = totalConversationCount > allConversations.length
    ? `${allConversations.length} of ${totalConversationCount}`
    : allConversations.length;
  const conversationTypeCounts = conversationListMeta?.conversation_counts || {};
  const directConversationCount = conversationTypeCounts.direct ?? conversations.direct.length;
  const groupConversationCount = conversationTypeCounts.group ?? conversations.group.length;
  const hasMoreConversationPages = Boolean(conversationListMeta?.next_page);

  const loadedUnreadCount = useMemo(
    () => allConversations.reduce((total, conversation) => total + (conversation.unread_count || 0), 0),
    [allConversations]
  );
  const totalUnreadCount = conversationListMeta?.unread_count ?? loadedUnreadCount;

  const fetchAllData = useCallback(async () => {
    const loadToken = conversationLoadTokenRef.current + 1;
    conversationLoadTokenRef.current = loadToken;

    try {
      setIsConversationListLoading(true);
      setIsConversationListLoadingMore(false);

      const { data } = await fetchConversations({ page: 1, per_page: CONVERSATIONS_PAGE_SIZE });
      const { conversations: firstPageConversations, meta } = normalizeConversationResponse(data);

      if (conversationLoadTokenRef.current === loadToken) {
        setConversations(mergeConversationGroups({ direct: [], group: [] }, firstPageConversations, true));
        setConversationListMeta(meta);
      }
    } catch (error) {
      console.error("Failed to load conversations", error);
    } finally {
      if (conversationLoadTokenRef.current === loadToken) {
        setIsConversationListLoading(false);
      }
    }
  }, []);

  const loadMoreConversations = useCallback(async () => {
    if (!conversationListMeta?.next_page || isConversationListLoadingMore) return;

    try {
      setIsConversationListLoadingMore(true);
      const { data } = await fetchConversations({
        page: conversationListMeta.next_page,
        per_page: CONVERSATIONS_PAGE_SIZE
      });
      const { conversations: pageConversations, meta } = normalizeConversationResponse(data);

      setConversations((previous) => mergeConversationGroups(previous, pageConversations, false));
      setConversationListMeta(meta);
    } catch (error) {
      console.error("Failed to load more conversations", error);
    } finally {
      setIsConversationListLoadingMore(false);
    }
  }, [conversationListMeta?.next_page, isConversationListLoadingMore]);

  const removeConversationLocally = useCallback((targetConversationId) => {
    const wasLoaded = allConversationsRef.current.some((conversation) => Number(conversation.id) === Number(targetConversationId));

    setConversations((previous) => removeConversationFromGroups(previous, targetConversationId));
    setConversationListMeta((previous) => previous && wasLoaded ? {
      ...previous,
      total_count: Math.max(0, (previous.total_count || 0) - 1)
    } : previous);

    const nextCache = { ...conversationCacheRef.current };
    delete nextCache[String(targetConversationId)];
    conversationCacheRef.current = nextCache;

    if (Number(conversationId) === Number(targetConversationId)) {
      setActiveConversation(null);
      setShowInfo(false);
      setIsThreadActionsOpen(false);
      if (embedded) {
        setEmbeddedConversationId(null);
      } else {
        navigate("/chat", { replace: true });
      }
    }
  }, [conversationId, embedded, navigate]);

  const refreshConversationSummary = useCallback(async (targetConversationId) => {
    if (!targetConversationId) return;

    try {
      const { data } = await fetchConversationSummary(targetConversationId);

      setConversations((previous) => mergeConversationGroups(previous, [data], false));
      setActiveConversation((previous) => {
        if (!previous || Number(previous.id) !== Number(targetConversationId)) return previous;

        const nextConversation = mergeConversationSummary(previous, data);
        conversationCacheRef.current = {
          ...conversationCacheRef.current,
          [String(targetConversationId)]: nextConversation
        };
        return nextConversation;
      });
      if (isLiveCall(data.active_call)) {
        setActiveCall(data.active_call);
      } else {
        setActiveCall((currentCall) => (
          Number(currentCall?.conversation_id) === Number(targetConversationId) ? null : currentCall
        ));
      }
    } catch (error) {
      if (error?.response?.status === 404) {
        removeConversationLocally(targetConversationId);
        return;
      }

      console.error("Failed to refresh conversation summary", error);
    }
  }, [removeConversationLocally]);

  const loadConversation = useCallback(async (id) => {
    if (!id) return;

    const cachedConversation = conversationCacheRef.current[String(id)];
    if (cachedConversation) {
      setActiveConversation(cachedConversation);
    } else {
      setActiveConversation(null);
    }
    setIsConversationLoading(true);

    try {
      const { data } = await fetchConversation(id);
      setActiveConversation(data);
      setMessagePageMeta(data.messages_meta || null);
      if (isLiveCall(data.active_call)) {
        setActiveCall(data.active_call);
      } else {
        setActiveCall((previous) => (
          Number(previous?.conversation_id) === Number(id) ? null : previous
        ));
      }
      conversationCacheRef.current = {
        ...conversationCacheRef.current,
        [String(id)]: data
      };
      setConversations((previous) => mergeConversationGroups(previous, [data], false));
    } catch (error) {
      if (error?.response?.status === 404) {
        removeConversationLocally(id);
        return;
      }

      console.error("Failed to load conversation details", error);
      setActiveConversation(null);
      setMessagePageMeta(null);
    } finally {
      setIsConversationLoading(false);
    }
  }, [removeConversationLocally]);

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || !messagePageMeta?.has_more || isLoadingOlderMessages) return;

    const container = messageListRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;

    try {
      setIsLoadingOlderMessages(true);
      const { data } = await fetchConversationMessages(conversationId, {
        before_id: messagePageMeta.next_before_id,
        limit: messagePageMeta.per_page || 50
      });
      const olderMessages = Array.isArray(data?.data) ? data.data : [];
      skipNextMessageAutoScrollRef.current = true;

      setActiveConversation((previous) => {
        if (!previous || Number(previous.id) !== Number(conversationId)) return previous;

        const existingIds = new Set((previous.messages || []).map((message) => Number(message.id)));
        const nextMessages = [
          ...olderMessages.filter((message) => !existingIds.has(Number(message.id))),
          ...(previous.messages || [])
        ];
        const nextConversation = { ...previous, messages: nextMessages };
        conversationCacheRef.current = {
          ...conversationCacheRef.current,
          [String(conversationId)]: nextConversation
        };
        return nextConversation;
      });
      setMessagePageMeta(data?.meta || null);

      window.requestAnimationFrame(() => {
        if (!container) return;
        container.scrollTop = container.scrollHeight - previousScrollHeight + container.scrollTop;
      });
    } catch (error) {
      console.error("Failed to load older messages", error);
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [conversationId, isLoadingOlderMessages, messagePageMeta]);

  const resetNewChatModal = useCallback((mode = "direct") => {
    setNewChatMode(mode);
    setNewChatStep("select");
    setSearchTerm("");
    setSelectedUserIds([]);
    setNewGroupTitle("");
  }, []);

  const openNewChatModal = useCallback((mode = "direct") => {
    resetNewChatModal(mode);
    setIsNewChatModalOpen(true);
  }, [resetNewChatModal]);

  const sendTyping = useCallback((isTyping, targetConversationId = conversationId) => {
    if (!targetConversationId) return;

    sendToConversation(targetConversationId, "typing", {
      conversation_id: targetConversationId,
      is_typing: isTyping
    });
  }, [conversationId]);

  const markConversationAsRead = useCallback((targetConversationId) => {
    if (!targetConversationId) return;

    sendToConversation(targetConversationId, "mark_as_read", {
      conversation_id: targetConversationId
    });
  }, []);

  useEffect(() => {
    fetchAllData();
    getUsers()
      .then(({ data }) => setUsers(Array.isArray(data) ? data : []))
      .catch((error) => console.error("Failed to load users", error));
    SchedulerAPI.getTasks()
      .then(({ data }) => setTasks(Array.isArray(data) ? data : []))
      .catch((error) => console.error("Failed to load tasks for chat mentions", error));
  }, [fetchAllData]);

  useEffect(() => {
    const subscription = subscribeToCableStatus(setCableStatus);
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!incomingCall) return undefined;

    const playTone = () => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const audioContext = ringtoneAudioContextRef.current || new AudioContext();
        ringtoneAudioContextRef.current = audioContext;

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.38);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.4);
      } catch (error) {
        // Browsers may block audio until the user interacts with the page.
      }
    };

    playTone();
    ringtoneTimerRef.current = window.setInterval(playTone, 1800);

    return () => {
      if (ringtoneTimerRef.current) {
        window.clearInterval(ringtoneTimerRef.current);
        ringtoneTimerRef.current = null;
      }
    };
  }, [incomingCall]);

  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
      setThreadSearchQuery("");
      setIsThreadSearchOpen(false);
      setIsThreadActionsOpen(false);
    } else {
      setActiveConversation(null);
      setMessagePageMeta(null);
      setIsConversationLoading(false);
      setIsThreadActionsOpen(false);
    }
  }, [conversationId, loadConversation]);

  useEffect(() => {
    if (deferredThreadSearchQuery.trim()) return;
    if (skipNextMessageAutoScrollRef.current) {
      skipNextMessageAutoScrollRef.current = false;
      return;
    }

    const container = messageListRef.current;
    if (!container) return;

    const timeoutId = window.setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [activeConversation?.messages?.length, conversationId, deferredThreadSearchQuery]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [messageBody]);

  const applyReactionUpdate = useCallback((messageId, updates = {}) => {
    setActiveConversation((previous) => {
      if (!previous) return previous;

      const nextConversation = {
        ...previous,
        messages: (previous.messages || []).map((message) => {
          if (Number(message.id) !== Number(messageId)) return message;

          const nextReactedEmojis = Array.isArray(updates.reacted_emojis)
            ? updates.reacted_emojis
            : (() => {
                const reactedEmojis = new Set(message.reacted_emojis || []);

                if (updates.last_actor_id && Number(updates.last_actor_id) === Number(user?.id) && updates.last_actor_emoji) {
                  if (updates.last_actor_action === "added") reactedEmojis.add(updates.last_actor_emoji);
                  if (updates.last_actor_action === "removed") reactedEmojis.delete(updates.last_actor_emoji);
                }

                return Array.from(reactedEmojis);
              })();

          return {
            ...message,
            reactions: updates.reactions || {},
            reacted_emojis: nextReactedEmojis
          };
        })
      };

      conversationCacheRef.current = {
        ...conversationCacheRef.current,
        [String(previous.id)]: nextConversation
      };
      return nextConversation;
    });
  }, [user?.id]);

  const mergeCallIntoConversationState = useCallback((callSession) => {
    if (!callSession) return;
    const nextActiveCall = isLiveCall(callSession) ? callSession : null;

    setConversations((previous) => mergeCallIntoConversationGroups(previous, callSession));

    setActiveConversation((previous) => {
      if (!previous || Number(previous.id) !== Number(callSession.conversation_id)) return previous;

      const nextConversation = { ...previous, active_call: nextActiveCall };
      conversationCacheRef.current = {
        ...conversationCacheRef.current,
        [String(previous.id)]: nextConversation
      };
      return nextConversation;
    });
  }, []);

  const applyCallSessionUpdate = useCallback((callSession) => {
    if (!callSession) return;

    mergeCallIntoConversationState(callSession);

    if (isLiveCall(callSession)) {
      setActiveCall(callSession);
      return;
    }

    setActiveCall((previous) => (
      Number(previous?.id) === Number(callSession.id) ? null : previous
    ));
    setIncomingCall((previous) => (
      Number(previous?.id) === Number(callSession.id) ? null : previous
    ));
    setCallCredentials(null);
  }, [mergeCallIntoConversationState]);

  const handleIncomingCall = useCallback((callSession) => {
    if (!callSession || Number(callSession.initiator_id) === Number(user?.id)) return;

    setIncomingCall(callSession);
    applyCallSessionUpdate(callSession);
    acknowledgeCallRing(callSession.id).catch((error) => {
      console.error("Failed to acknowledge incoming call", error);
    });
  }, [applyCallSessionUpdate, user?.id]);

  const handleJoinCall = useCallback(async (callSession = incomingCall || activeCall) => {
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
      applyCallSessionUpdate(data.call_session);
      if (data.call_session?.conversation_id) openConversation(data.call_session.conversation_id);
    } catch (error) {
      console.error("Failed to join call", error);
      setCallError(error?.response?.data?.message || "Unable to join the call.");
    } finally {
      setIsCallConnecting(false);
    }
  }, [activeCall, applyCallSessionUpdate, incomingCall, isCallConnecting, openConversation]);

  const handleCallConnectionError = useCallback((message, error) => {
    console.error("LiveKit call connection failed", error || message);
    setCallError(message || "Could not connect to the call media server.");
  }, []);

  const handleCallConnected = useCallback(() => {
    setCallError("");
  }, []);

  const handleRetryCallConnection = useCallback(() => {
    if (!activeCall || isCallConnecting) return;
    handleJoinCall(activeCall);
  }, [activeCall, handleJoinCall, isCallConnecting]);

  const handleStartCall = useCallback(async (callType) => {
    if (!conversationId || isCallConnecting) return;

    try {
      setIsCallConnecting(true);
      setCallError("");
      const { data } = await createCall(conversationId, callType);
      const callSession = data.call_session;
      applyCallSessionUpdate(callSession);
      await handleJoinCall(callSession);
    } catch (error) {
      console.error("Failed to start call", error);
      setCallError(error?.response?.data?.message || "Unable to start the call.");
    } finally {
      setIsCallConnecting(false);
    }
  }, [applyCallSessionUpdate, conversationId, handleJoinCall, isCallConnecting]);

  const handleDeclineCall = useCallback(async (callSession = incomingCall) => {
    if (!callSession) return;

    try {
      const { data } = await declineCall(callSession.id);
      setIncomingCall(null);
      applyCallSessionUpdate(data.call_session);
    } catch (error) {
      console.error("Failed to decline call", error);
      setIncomingCall(null);
    }
  }, [applyCallSessionUpdate, incomingCall]);

  const handleLeaveCall = useCallback(async () => {
    if (!activeCall || callLeaveInFlightRef.current) return;

    callLeaveInFlightRef.current = true;
    const leavingCallId = activeCall.id;

    try {
      await leaveCall(leavingCallId);
    } catch (error) {
      console.error("Failed to leave call", error);
    } finally {
      setCallCredentials(null);
      setActiveCall((previous) => (
        Number(previous?.id) === Number(leavingCallId) ? null : previous
      ));
      callLeaveInFlightRef.current = false;
    }
  }, [activeCall]);

  const handleEndActiveCall = useCallback(async () => {
    if (!activeCall) return;

    try {
      const { data } = await endCallSession(activeCall.id, "ended");
      setCallCredentials(null);
      applyCallSessionUpdate(data.call_session);
    } catch (error) {
      console.error("Failed to end call", error);
    }
  }, [activeCall, applyCallSessionUpdate]);

  const handleMuteConversation = useCallback(async (conversation, duration = "forever") => {
    if (!conversation) return;

    try {
      const { data } = await muteConversation(conversation.id, duration);
      setConversations((previous) => mergeConversationGroups(previous, [data], false));
      setActiveConversation((previous) => (
        Number(previous?.id) === Number(conversation.id) ? mergeConversationSummary(previous, data) : previous
      ));
    } catch (error) {
      console.error("Failed to mute conversation", error);
    }
  }, []);

  const handleUnmuteConversation = useCallback(async (conversation) => {
    if (!conversation) return;

    try {
      const { data } = await unmuteConversation(conversation.id);
      setConversations((previous) => mergeConversationGroups(previous, [data], false));
      setActiveConversation((previous) => (
        Number(previous?.id) === Number(conversation.id) ? mergeConversationSummary(previous, data) : previous
      ));
    } catch (error) {
      console.error("Failed to unmute conversation", error);
    }
  }, []);

  useEffect(() => {
    const userSub = subscribeToUserChat((payload) => {
      if (payload?.type === "conversation_refresh") {
        refreshConversationSummary(payload.conversation_id);
      }

      if (payload?.type === "conversation_hidden" || payload?.type === "conversation_deleted") {
        removeConversationLocally(payload.conversation_id);
      }

      if (payload?.type === "call_ringing") {
        handleIncomingCall(payload.call_session);
      }

      if (["call_started", "call_participant_joined", "call_participant_left", "call_missed", "call_ended"].includes(payload?.type)) {
        applyCallSessionUpdate(payload.call_session);
      }
    });

    return () => userSub.unsubscribe();
  }, [applyCallSessionUpdate, handleIncomingCall, refreshConversationSummary, removeConversationLocally]);

  useEffect(() => {
    if (!conversationId) return undefined;

    const convSub = subscribeToConversationChat(conversationId, (payload) => {
      if (payload?.type === "message_created" && Number(payload.conversation_id) === Number(conversationId)) {
        setActiveConversation((previous) => {
          if (!previous) return previous;
          if (previous.messages?.some((message) => message.id === payload.message.id)) return previous;

          const nextConversation = {
            ...previous,
            messages: [...(previous.messages || []), payload.message]
          };

          conversationCacheRef.current = {
            ...conversationCacheRef.current,
            [String(conversationId)]: nextConversation
          };
          return nextConversation;
        });

        refreshConversationSummary(conversationId);
        markConversationAsRead(conversationId);
      }

      if (payload?.type === "conversation_deleted" && Number(payload.conversation_id) === Number(conversationId)) {
        removeConversationLocally(conversationId);
      }

      if (payload?.type === "message_reactions_updated" && Number(payload.conversation_id) === Number(conversationId)) {
        applyReactionUpdate(payload.message_id, payload);
      }

      if (payload?.type === "typing_indicator" && Number(payload.conversation_id) === Number(conversationId)) {
        if (Number(payload.user_id) === Number(user?.id)) return;

        setTypingUsers((previous) => {
          const next = { ...previous };

          if (payload.is_typing) {
            if (next[payload.user_id]?.timeout) clearTimeout(next[payload.user_id].timeout);

            next[payload.user_id] = {
              name: payload.user_name,
              timeout: window.setTimeout(() => {
                setTypingUsers((current) => {
                  const updated = { ...current };
                  delete updated[payload.user_id];
                  return updated;
                });
              }, 3000)
            };
          } else {
            if (next[payload.user_id]?.timeout) clearTimeout(next[payload.user_id].timeout);
            delete next[payload.user_id];
          }

          return next;
        });
      }

      if (payload?.type === "message_read" && Number(payload.conversation_id) === Number(conversationId)) {
        setActiveConversation((previous) => {
          if (!previous) return previous;

          return {
            ...previous,
            participants: (previous.participants || []).map((participant) => (
              Number(participant.id) === Number(payload.user_id)
                ? { ...participant, last_read_at: payload.read_at }
                : participant
            ))
          };
        });
      }

      if (["call_started", "call_participant_joined", "call_participant_left", "call_missed", "call_ended"].includes(payload?.type) && Number(payload.conversation_id) === Number(conversationId)) {
        applyCallSessionUpdate(payload.call_session);
      }
    });

    return () => convSub.unsubscribe();
  }, [applyCallSessionUpdate, applyReactionUpdate, conversationId, markConversationAsRead, refreshConversationSummary, removeConversationLocally, user?.id]);

  useEffect(() => () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (ringtoneTimerRef.current) window.clearInterval(ringtoneTimerRef.current);
    ringtoneAudioContextRef.current?.close?.();
  }, []);

  const activeConversationMessages = useMemo(() => {
    const messages = activeConversation?.messages || [];
    return [...messages].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
  }, [activeConversation?.messages]);

  const attachmentPreviewUrls = useMemo(
    () => attachments.map((file) => (file.type.startsWith("image/") || file.type.startsWith("video/")) ? URL.createObjectURL(file) : null),
    [attachments]
  );

  useEffect(() => {
    return () => {
      attachmentPreviewUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [attachmentPreviewUrls]);

  const activeConversationName = useMemo(
    () => getConversationDisplayName(activeConversation, user?.id),
    [activeConversation, user?.id]
  );

  const activeConversationImage = useMemo(
    () => getConversationDisplayImage(activeConversation, user?.id),
    [activeConversation, user?.id]
  );

  const activeConversationOtherParticipant = useMemo(
    () => getConversationOtherParticipant(activeConversation, user?.id),
    [activeConversation, user?.id]
  );

  const visibleCall = useMemo(() => {
    if (isLiveCall(activeConversation?.active_call)) return activeConversation.active_call;
    if (isLiveCall(activeCall) && Number(activeCall.conversation_id) === Number(activeConversation?.id)) return activeCall;
    return null;
  }, [activeCall, activeConversation?.active_call, activeConversation?.id]);

  const typingNames = useMemo(
    () => Object.values(typingUsers).map((entry) => entry.name),
    [typingUsers]
  );

  const usersById = useMemo(
    () => users.reduce((lookup, candidate) => {
      lookup[Number(candidate.id)] = candidate;
      return lookup;
    }, {}),
    [users]
  );

  const usersByHandle = useMemo(
    () => users.reduce((lookup, candidate) => {
      getUserMentionAliases(candidate).forEach((alias) => {
        if (alias && !lookup[alias]) lookup[alias] = candidate;
      });

      return lookup;
    }, {}),
    [users]
  );

  const mentionableTasks = useMemo(
    () => tasks.filter((task) => task.task_id),
    [tasks]
  );

  const tasksByKey = useMemo(
    () => mentionableTasks.reduce((lookup, task) => {
      const taskKey = getTaskReferenceKey(task);
      if (taskKey && !lookup[taskKey]) lookup[taskKey] = task;
      return lookup;
    }, {}),
    [mentionableTasks]
  );

  const mentionLookups = useMemo(
    () => ({ usersByHandle, tasksByKey }),
    [tasksByKey, usersByHandle]
  );

  const conversationParticipants = useMemo(
    () => (activeConversation?.participants || []).map((participant) => ({
      ...(usersById[Number(participant.id)] || {}),
      ...participant,
      name: participant.name || getFullUserName(usersById[Number(participant.id)] || participant)
    })),
    [activeConversation?.participants, usersById]
  );

  const mentionableUsers = useMemo(() => {
    const seenIds = new Set();

    return conversationParticipants.filter((participant) => {
      const participantId = Number(participant.id);

      if (!participantId || participantId === Number(user?.id) || seenIds.has(participantId)) {
        return false;
      }

      seenIds.add(participantId);
      return true;
    });
  }, [conversationParticipants, user?.id]);

  const activeComposerEntity = useMemo(
    () => getComposerEntityQuery(messageBody, composerSelection.start),
    [composerSelection.start, messageBody]
  );

  const userMentionSuggestions = useMemo(() => {
    if (activeComposerEntity?.trigger !== "@") return [];

    const normalizedQuery = activeComposerEntity.query.trim().toLowerCase();

    return mentionableUsers
      .filter((candidate) => {
        const searchableText = [
          getFullUserName(candidate),
          candidate.email,
          candidate.job_title,
          ...getUserMentionAliases(candidate)
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return !normalizedQuery || searchableText.includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftHandle = getPreferredUserMentionHandle(left);
        const rightHandle = getPreferredUserMentionHandle(right);
        const leftStarts = leftHandle.startsWith(normalizedQuery) || getFullUserName(left).toLowerCase().startsWith(normalizedQuery);
        const rightStarts = rightHandle.startsWith(normalizedQuery) || getFullUserName(right).toLowerCase().startsWith(normalizedQuery);

        if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;

        return getFullUserName(left).localeCompare(getFullUserName(right));
      })
      .slice(0, 6)
      .map((candidate) => ({
        trigger: "@",
        id: candidate.id,
        label: getFullUserName(candidate),
        description: candidate.job_title || candidate.email || "Conversation participant",
        insertText: `@${getPreferredUserMentionHandle(candidate)}`,
        profilePicture: candidate.profile_picture
      }));
  }, [activeComposerEntity, mentionableUsers]);

  const taskMentionSuggestions = useMemo(() => {
    if (activeComposerEntity?.trigger !== "#") return [];

    const normalizedQuery = activeComposerEntity.query.trim().toLowerCase();

    return mentionableTasks
      .filter((task) => {
        const searchableText = [
          task.task_id,
          task.title,
          task.status
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return !normalizedQuery || searchableText.includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftKey = (left.task_id || "").toLowerCase();
        const rightKey = (right.task_id || "").toLowerCase();
        const leftStarts = leftKey.startsWith(normalizedQuery);
        const rightStarts = rightKey.startsWith(normalizedQuery);

        if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;

        return leftKey.localeCompare(rightKey);
      })
      .slice(0, 6)
      .map((task) => ({
        trigger: "#",
        id: task.id || task.task_id,
        label: task.task_id,
        description: task.title || task.status || "Task",
        insertText: `#${task.task_id}`
      }));
  }, [activeComposerEntity, mentionableTasks]);

  const activeMentionSuggestions = useMemo(() => {
    if (activeComposerEntity?.trigger === "@") return userMentionSuggestions;
    if (activeComposerEntity?.trigger === "#") return taskMentionSuggestions;
    return [];
  }, [activeComposerEntity?.trigger, taskMentionSuggestions, userMentionSuggestions]);

  useEffect(() => {
    setActiveMentionIndex(0);
  }, [activeComposerEntity?.query, activeComposerEntity?.trigger, activeConversation?.id]);

  const filteredConversations = useMemo(() => {
    const normalizedQuery = deferredSideSearchQuery.trim().toLowerCase();
    const matchesSearch = (conversation) => {
      if (!normalizedQuery) return true;
      const displayName = getConversationDisplayName(conversation, user?.id).toLowerCase();
      const lastMessage = resolveChatMessageText(conversation.last_message || "", mentionLookups).toLowerCase();
      return displayName.includes(normalizedQuery) || lastMessage.includes(normalizedQuery);
    };

    const matchesFilter = (conversation) => {
      if (conversationFilter === "all") return true;
      if (conversationFilter === "unread") return conversation.unread_count > 0;
      return conversation.conversation_type === conversationFilter;
    };

    return {
      direct: conversations.direct.filter((conversation) => matchesFilter(conversation) && matchesSearch(conversation)),
      group: conversations.group.filter((conversation) => matchesFilter(conversation) && matchesSearch(conversation))
    };
  }, [conversationFilter, conversations, deferredSideSearchQuery, mentionLookups, user?.id]);

  const filteredMessages = useMemo(() => {
    if (!deferredThreadSearchQuery.trim()) return activeConversationMessages;
    return activeConversationMessages.filter((message) => messageMatchesQuery(message, deferredThreadSearchQuery, mentionLookups));
  }, [activeConversationMessages, deferredThreadSearchQuery, mentionLookups]);

  const groupedMessages = useMemo(
    () => groupMessagesByDay(filteredMessages),
    [filteredMessages]
  );

  const sharedAttachments = useMemo(
    () => (
      activeConversationMessages
        .flatMap((message) => (
          (message.attachments || []).map((attachment) => ({
            ...attachment,
            message_id: message.id,
            sent_at: message.created_at,
            sender_name: message.user_name
          }))
        ))
        .sort((left, right) => new Date(right.sent_at) - new Date(left.sent_at))
    ),
    [activeConversationMessages]
  );

  const availableUsers = useMemo(
    () => users.filter((candidate) => Number(candidate.id) !== Number(user?.id)),
    [user?.id, users]
  );

  const filteredUsers = useMemo(() => {
    const normalizedQuery = deferredUserSearchTerm.trim().toLowerCase();
    if (!normalizedQuery) return availableUsers;

    return availableUsers.filter((candidate) => {
      const haystack = [
        getFullUserName(candidate),
        candidate.email,
        candidate.job_title
      ].join(" ").toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [availableUsers, deferredUserSearchTerm]);

  const selectedUsers = useMemo(
    () => availableUsers.filter((candidate) => selectedUserIds.includes(candidate.id)),
    [availableUsers, selectedUserIds]
  );

  const conversationStarterSuggestions = useMemo(() => {
    if (!activeConversation) return [];
    if (activeConversation.conversation_type === "group") {
      return [
        "Quick update: here is where we stand today.",
        "What are the top blockers we should solve next?",
        "Sharing the latest version for feedback."
      ];
    }

    return [
      `Hi ${activeConversationOtherParticipant?.name || "there"}, are you free for a quick update?`,
      "Sending over the latest note now.",
      "Can we sync on the next step here?"
    ];
  }, [activeConversation, activeConversationOtherParticipant?.name]);

  const handleToggleReaction = useCallback(async (messageId, emoji, isActive) => {
    if (!conversationId) return;

    try {
      const { data } = isActive
        ? await removeMessageReaction(conversationId, messageId, emoji)
        : await addMessageReaction(conversationId, messageId, emoji);

      applyReactionUpdate(messageId, {
        reactions: data?.reactions || {},
        reacted_emojis: data?.reacted_emojis || []
      });
    } catch (error) {
      console.error("Failed to update reaction", error);
    }
  }, [applyReactionUpdate, conversationId]);

  const addAttachments = useCallback((files = []) => {
    const nextFiles = Array.from(files).filter(Boolean);
    if (!nextFiles.length) return;

    setAttachments((previous) => [...previous, ...nextFiles]);
  }, []);

  const handleAddAttachments = (event) => {
    addAttachments(event.target.files || []);
    event.target.value = "";
  };

  const handleDragOverAttachments = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFiles(true);
  };

  const handleDragLeaveAttachments = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setIsDraggingFiles(false);
  };

  const handleDropAttachments = (event) => {
    event.preventDefault();
    setIsDraggingFiles(false);
    addAttachments(event.dataTransfer.files || []);
  };

  const syncComposerSelection = (event) => {
    setComposerSelection({
      start: event.target.selectionStart ?? 0,
      end: event.target.selectionEnd ?? 0
    });
  };

  const handleSelectMention = (suggestion) => {
    if (!activeComposerEntity) return;

    const replacement = suggestion.insertText;
    const nextComposerState = applyComposerEntity(messageBody, activeComposerEntity, replacement);

    setMessageBody(nextComposerState.value);
    setComposerSelection({
      start: nextComposerState.selectionStart,
      end: nextComposerState.selectionEnd
    });
    setActiveMentionIndex(0);

    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
      composerTextareaRef.current?.setSelectionRange(nextComposerState.selectionStart, nextComposerState.selectionEnd);
    });
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if ((!messageBody.trim() && attachments.length === 0) || !conversationId) return;

    setIsSending(true);

    try {
      const formData = new FormData();
      formData.append("message[body]", messageBody);
      attachments.forEach((file) => formData.append("message[attachments][]", file));

      const { data: newMessage } = await sendMessage(conversationId, formData);

      setActiveConversation((previous) => {
        if (!previous) return previous;
        if (previous.messages?.some((message) => message.id === newMessage.id)) return previous;

        const nextConversation = {
          ...previous,
          messages: [...(previous.messages || []), newMessage]
        };

        conversationCacheRef.current = {
          ...conversationCacheRef.current,
          [String(conversationId)]: nextConversation
        };
        return nextConversation;
      });

      setMessageBody("");
      setAttachments([]);
      setComposerSelection({ start: 0, end: 0 });
      setActiveMentionIndex(0);
      refreshConversationSummary(conversationId);
    } catch (error) {
      console.error("Failed to send message", error);
    } finally {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      sendTyping(false);
      setIsSending(false);
    }
  };

  const handleSelectUser = (userId) => {
    if (newChatMode === "direct") {
      setSelectedUserIds([userId]);
      return;
    }

    setSelectedUserIds((previous) => (
      previous.includes(userId)
        ? previous.filter((currentId) => currentId !== userId)
        : [...previous, userId]
    ));
  };

  const handleContinueNewChat = async () => {
    if (newChatMode === "direct") {
      if (!selectedUserIds[0]) return;

      try {
        const { data } = await startDirectConversation(selectedUserIds[0]);
        setIsNewChatModalOpen(false);
        setConversations((previous) => mergeConversationGroups(previous, [data], false));
        openConversation(data.id);
      } catch (error) {
        console.error("Failed to start direct conversation", error);
      }

      return;
    }

    if (newChatStep === "select") {
      if (selectedUserIds.length < 2) return;
      setNewChatStep("details");
      return;
    }

    if (!newGroupTitle.trim()) return;

    try {
      const { data } = await createConversation({
        title: newGroupTitle,
        conversation_type: "group",
        participant_ids: selectedUserIds
      });

      setIsNewChatModalOpen(false);
      resetNewChatModal("group");
      setConversations((previous) => mergeConversationGroups(previous, [data], false));
      openConversation(data.id);
    } catch (error) {
      console.error("Failed to create group", error);
    }
  };

  const handleHideConversation = async (conversation) => {
    if (!conversation) return;

    const displayName = getConversationDisplayName(conversation, user?.id);
    if (!window.confirm(`Hide "${displayName}" from your inbox? New messages will bring it back.`)) return;

    try {
      removeConversationLocally(conversation.id);
      await deleteConversation(conversation.id);
    } catch (error) {
      console.error("Failed to hide conversation", error);
      fetchAllData();
    }
  };

  const handleDeleteConversationForEveryone = async (conversation) => {
    if (!conversation?.can_delete_for_everyone) return;

    const confirmation = `DELETE ${conversation.id}`;
    const enteredConfirmation = window.prompt(
      `Delete this conversation for everyone? This removes all messages and cannot be undone.\n\nType ${confirmation} to confirm.`
    );

    if (enteredConfirmation !== confirmation) return;

    try {
      removeConversationLocally(conversation.id);
      await deleteConversationForEveryone(conversation.id, confirmation);
    } catch (error) {
      console.error("Failed to delete conversation", error);
      fetchAllData();
    }
  };

  const threadStatusLabel = typingNames.length > 0
    ? `${typingNames.join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing...`
    : activeConversation?.conversation_type === "group"
      ? `${activeConversation?.participants?.length || 0} members • updated ${activeConversation?.updated_at ? formatDistanceToNow(new Date(activeConversation.updated_at), { addSuffix: true }) : "recently"}`
      : activeConversationOtherParticipant?.job_title || "Private conversation";

  const sidebarEmpty = !isConversationListLoading && filteredConversations.direct.length === 0 && filteredConversations.group.length === 0;

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-[linear-gradient(135deg,#eef6ff_0%,#f8fbff_45%,#f8f5ff_100%)] p-1.5 md:p-3 dark:bg-[linear-gradient(135deg,#09090b_0%,#111827_55%,#09090b_100%)]">
      <div className="relative flex min-h-0 h-full w-full overflow-hidden rounded-[24px] border border-white/70 bg-white/30 shadow-[0_35px_90px_-45px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.24),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.14),transparent_24%)]" />

        <aside className={`relative z-10 flex min-h-0 w-full flex-col border-r border-white/60 bg-white/82 backdrop-blur-2xl dark:border-zinc-800 dark:bg-zinc-950/82 md:w-[20rem] xl:w-[22rem] ${conversationId ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-white/70 px-3 py-2 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-slate-950 dark:text-white">Messages</h1>
              {totalUnreadCount > 0 && (
                <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-white dark:bg-white dark:text-slate-950">
                  {totalUnreadCount}
                </span>
              )}
              {cableStatus !== "connected" && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
                  <FiWifiOff className="h-3 w-3" />
                  {cableStatus}
                </span>
              )}
              <button
                type="button"
                onClick={() => openNewChatModal("group")}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800"
                title="Create group room"
              >
                <FiUsers className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => openNewChatModal("direct")}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-white transition hover:brightness-110 dark:bg-white dark:text-slate-950"
                title="Start a new conversation"
              >
                <FiEdit className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={sideSearchQuery}
                  onChange={(event) => setSideSearchQuery(event.target.value)}
                  placeholder="Search"
                  className="h-8 w-full rounded-lg border border-slate-200 bg-white/90 pl-8 pr-2 text-xs text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-slate-100 dark:focus:border-sky-700 dark:focus:ring-sky-950/50"
                />
              </div>

              <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-900">
                {CONVERSATION_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setConversationFilter(filter.id)}
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                      conversationFilter === filter.id
                        ? "bg-white text-slate-950 shadow-sm dark:bg-zinc-700 dark:text-white"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="scrollbar-hide relative flex-1 overflow-y-auto px-2 py-2">
            {isConversationListLoading && allConversations.length === 0 ? (
              <div className="space-y-3 px-2">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="rounded-[22px] border border-white/70 bg-white/72 p-3.5 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.5)] dark:border-zinc-800 dark:bg-zinc-900/80">
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 animate-pulse rounded-full bg-slate-200 dark:bg-zinc-800" />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="h-3 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-zinc-800" />
                        <div className="h-3 w-44 animate-pulse rounded-full bg-slate-100 dark:bg-zinc-900" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : sidebarEmpty ? (
              <div className="mx-2 rounded-[26px] border border-dashed border-slate-200 bg-white/80 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/70">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200">
                  <FiSearch className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">No conversations match</h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Try a broader search or start a fresh conversation.
                </p>
                <button
                  type="button"
                  onClick={() => openNewChatModal("direct")}
                  className="mt-5 inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 dark:bg-white dark:text-slate-950"
                >
                  Start new chat
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredConversations.direct.length > 0 && (
                  <section>
                    <div className="mb-1 flex items-center justify-between px-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Direct</p>
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                        {filteredConversations.direct.length}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      {filteredConversations.direct.map((conversation) => (
                        <ConversationItem
                          key={conversation.id}
                          conversation={conversation}
                          currentUserId={user?.id}
                          isActive={Number(conversationId) === Number(conversation.id)}
                          searchQuery={deferredSideSearchQuery}
                          previewText={resolveChatMessageText(conversation.last_message || "", mentionLookups)}
                          onSelect={embedded ? openConversation : undefined}
                          onHide={handleHideConversation}
                          onDeleteForEveryone={handleDeleteConversationForEveryone}
                          onMute={handleMuteConversation}
                          onUnmute={handleUnmuteConversation}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {filteredConversations.group.length > 0 && (
                  <section>
                    <div className="mb-1 flex items-center justify-between px-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Groups</p>
                      <button
                        type="button"
                        onClick={() => openNewChatModal("group")}
                        className="rounded-md px-2 py-1 text-[10px] font-semibold text-slate-500 transition hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-zinc-900 dark:hover:text-white"
                      >
                        New
                      </button>
                    </div>

                    <div className="space-y-0.5">
                      {filteredConversations.group.map((conversation) => (
                        <ConversationItem
                          key={conversation.id}
                          conversation={conversation}
                          currentUserId={user?.id}
                          isActive={Number(conversationId) === Number(conversation.id)}
                          searchQuery={deferredSideSearchQuery}
                          previewText={resolveChatMessageText(conversation.last_message || "", mentionLookups)}
                          onSelect={embedded ? openConversation : undefined}
                          onHide={handleHideConversation}
                          onDeleteForEveryone={handleDeleteConversationForEveryone}
                          onMute={handleMuteConversation}
                          onUnmute={handleUnmuteConversation}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {hasMoreConversationPages && (
                  <button
                    type="button"
                    onClick={loadMoreConversations}
                    disabled={isConversationListLoadingMore}
                    className="mx-2 w-[calc(100%-1rem)] rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-white disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-slate-300 dark:hover:bg-zinc-900"
                  >
                    {isConversationListLoadingMore ? "Loading..." : "Load more"}
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        <main className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col ${!conversationId ? "hidden md:flex" : "flex"}`}>
          {conversationId && isConversationLoading && !activeConversation ? (
            <div className="relative flex flex-1 items-center justify-center p-6 md:p-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.22),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.6),rgba(248,250,252,0.72))] dark:bg-[linear-gradient(180deg,rgba(9,9,11,0.72),rgba(17,24,39,0.82))]" />
              <div className="relative z-10 w-full max-w-xl rounded-[32px] border border-white/80 bg-white/78 p-8 shadow-[0_30px_70px_-40px_rgba(15,23,42,0.8)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/78">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 animate-pulse rounded-full bg-slate-200 dark:bg-zinc-800" />
                  <div className="flex-1 space-y-3">
                    <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-zinc-800" />
                    <div className="h-3 w-48 animate-pulse rounded-full bg-slate-100 dark:bg-zinc-900" />
                  </div>
                </div>
                <div className="mt-8 space-y-4">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className={`flex ${item % 2 === 0 ? "justify-end" : "justify-start"}`}>
                      <div className="h-20 w-[70%] animate-pulse rounded-[24px] bg-slate-200/80 dark:bg-zinc-800/90" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : !activeConversation ? (
            <div className="relative flex flex-1 items-center justify-center p-6 md:p-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.22),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.6),rgba(248,250,252,0.72))] dark:bg-[linear-gradient(180deg,rgba(9,9,11,0.72),rgba(17,24,39,0.82))]" />
              <div className="relative z-10 max-w-xl rounded-[32px] border border-white/80 bg-white/78 p-8 text-center shadow-[0_30px_70px_-40px_rgba(15,23,42,0.8)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/78">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#0f172a,#1e293b)] text-white shadow-[0_24px_60px_-32px_rgba(15,23,42,1)]">
                  <FiMessageSquare className="h-9 w-9" />
                </div>
                <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.34em] text-sky-500">Workspace Chat</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">A cleaner inbox for fast team conversations</h2>
                <p className="mt-4 text-sm leading-7 text-slate-500 dark:text-slate-400">
                  Pick a conversation from the list, search your history, or start a new room with the people you need.
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <StatCard icon={<FiLayers className="h-4 w-4" />} label="Threads" value={allConversations.length} accentClass="bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-slate-200" />
                  <StatCard icon={<FiZap className="h-4 w-4" />} label="Unread" value={totalUnreadCount} accentClass="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200" />
                  <StatCard icon={<FiUsers className="h-4 w-4" />} label="Teams" value={groupConversationCount} accentClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200" />
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={() => openNewChatModal("direct")}
                    className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 dark:bg-white dark:text-slate-950"
                  >
                    Start new chat
                  </button>
                  <button
                    type="button"
                    onClick={() => openNewChatModal("group")}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
                  >
                    Create group room
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <header className="relative z-20 border-b border-white/70 bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/72 md:px-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {embedded ? (
                      <button
                        type="button"
                        onClick={() => setEmbeddedConversationId(null)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 md:hidden"
                      >
                        <FiArrowLeft className="h-5 w-5" />
                      </button>
                    ) : (
                      <Link
                        to="/chat"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 md:hidden"
                      >
                        <FiArrowLeft className="h-5 w-5" />
                      </Link>
                    )}

                    {activeConversation.conversation_type === "direct" ? (
                      <Avatar name={activeConversationName} src={activeConversationImage} size="lg" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-cyan-50 text-sky-700 ring-2 ring-white/90 dark:from-sky-950/60 dark:to-cyan-950/40 dark:text-sky-200">
                        <FiUsers className="h-6 w-6" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                          {activeConversationName}
                        </h2>
                        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white dark:bg-white dark:text-slate-950">
                          {activeConversation.conversation_type === "group" ? "Group" : "Direct"}
                        </span>
                      </div>
                      <p className={`mt-1 truncate text-sm ${typingNames.length > 0 ? "text-emerald-500" : "text-slate-500 dark:text-slate-400"}`}>
                        {isConversationLoading ? "Syncing conversation..." : threadStatusLabel}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartCall("audio")}
                      disabled={isCallConnecting || Boolean(visibleCall)}
                      className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800"
                      title="Start voice call"
                    >
                      <FiPhone className="h-4.5 w-4.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartCall("video")}
                      disabled={isCallConnecting || Boolean(visibleCall)}
                      className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800"
                      title="Start video call"
                    >
                      <FiVideo className="h-4.5 w-4.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsThreadSearchOpen((previous) => !previous);
                        if (isThreadSearchOpen) setThreadSearchQuery("");
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl transition ${
                        isThreadSearchOpen
                          ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                          : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800"
                      }`}
                      title="Search in conversation"
                    >
                      <FiSearch className="h-4.5 w-4.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowInfo((previous) => !previous)}
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl transition ${
                        showInfo
                          ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                          : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800"
                      }`}
                      title="Conversation details"
                    >
                      <FiInfo className="h-4.5 w-4.5" />
                    </button>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsThreadActionsOpen((previous) => !previous)}
                        className={`hidden h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800 md:flex ${isThreadActionsOpen ? "ring-2 ring-sky-100 dark:ring-sky-950/60" : ""}`}
                        title="More actions"
                      >
                        <FiMoreVertical className="h-4.5 w-4.5" />
                      </button>

                      {isThreadActionsOpen && (
                        <div className="absolute right-0 top-12 z-40 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-700 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setIsThreadActionsOpen(false);
                              handleHideConversation(activeConversation);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-slate-50 dark:hover:bg-zinc-800"
                          >
                            <FiTrash2 className="h-4 w-4" />
                            Hide for me
                          </button>
                          {activeConversation.can_delete_for_everyone && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsThreadActionsOpen(false);
                                handleDeleteConversationForEveryone(activeConversation);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              <FiTrash2 className="h-4 w-4" />
                              Delete for everyone
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isThreadSearchOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-4"
                    >
                      <div className="relative">
                        <FiSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          value={threadSearchQuery}
                          onChange={(event) => setThreadSearchQuery(event.target.value)}
                          placeholder="Search messages, people, or attachments in this thread"
                          className="w-full rounded-2xl border border-white/70 bg-white/82 py-3 pl-11 pr-11 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-slate-100 dark:focus:border-sky-700 dark:focus:ring-sky-950/50"
                          autoFocus
                        />
                        {threadSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setThreadSearchQuery("")}
                            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-zinc-800"
                          >
                            <FiX className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </header>

              <div className="relative flex min-h-0 flex-1 overflow-hidden">
                <div className="relative flex min-w-0 flex-1 flex-col">
                  {visibleCall && (
                    <div className="border-b border-sky-100 bg-sky-50/90 px-4 py-3 backdrop-blur dark:border-sky-950/60 dark:bg-sky-950/25 md:px-6">
                      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white">
                            {visibleCall.call_type === "audio" ? <FiPhoneCall className="h-5 w-5" /> : <FiVideo className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {visibleCall.call_type === "audio" ? "Voice call" : "Video call"} {visibleCall.status === "ringing" ? "is ringing" : "is active"}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-300">
                              Started by {visibleCall.initiator_name} • {visibleCall.participants?.filter((participant) => participant.status === "joined").length || 0} joined
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!callCredentials && (
                            <button
                              type="button"
                              onClick={() => handleJoinCall(visibleCall)}
                              disabled={isCallConnecting}
                              className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50 dark:bg-white dark:text-slate-950"
                            >
                              {isCallConnecting ? "Joining..." : "Join"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleEndActiveCall}
                            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/30"
                          >
                            <FiPhoneOff className="h-3.5 w-3.5" />
                            End
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {callError && (
                    <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-center text-xs font-semibold text-red-600 dark:border-red-950 dark:bg-red-950/30 dark:text-red-200">
                      {callError}
                    </div>
                  )}

                  <div
                    ref={messageListRef}
                    className="scrollbar-hide relative flex-1 overflow-y-auto px-4 py-4 md:px-5 md:py-4"
                    style={{
                      backgroundImage: "radial-gradient(circle at top, rgba(96,165,250,0.12), transparent 28%), radial-gradient(circle at bottom right, rgba(56,189,248,0.14), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.55), rgba(248,250,252,0.78))"
                    }}
                  >
                    <div className="mx-auto flex max-w-4xl flex-col gap-4">
                      <div className="sticky top-0 z-10 flex justify-center">
                        <span className="rounded-full border border-white/80 bg-white/90 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-slate-300">
                          {deferredThreadSearchQuery.trim()
                            ? `${filteredMessages.length} match${filteredMessages.length === 1 ? "" : "es"} for "${deferredThreadSearchQuery}"`
                            : `${activeConversationName} • ${activeConversationMessages.length} messages`}
                        </span>
                      </div>

                      {messagePageMeta?.has_more && !deferredThreadSearchQuery.trim() && (
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={loadOlderMessages}
                            disabled={isLoadingOlderMessages}
                            className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-white disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-slate-300"
                          >
                            {isLoadingOlderMessages ? "Loading..." : "Load older messages"}
                          </button>
                        </div>
                      )}

                      {activeConversationMessages.length === 0 ? (
                        <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/76 px-6 py-10 text-center shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/72">
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200">
                            <FiMessageSquare className="h-7 w-7" />
                          </div>
                          <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">This conversation is empty</h3>
                          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            Start with a clear opener, a status update, or a quick request.
                          </p>

                          <div className="mt-6 flex flex-wrap justify-center gap-2">
                            {conversationStarterSuggestions.map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                onClick={() => setMessageBody(suggestion)}
                                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : groupedMessages.length === 0 ? (
                        <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/76 px-6 py-10 text-center shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/72">
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200">
                            <FiSearch className="h-7 w-7" />
                          </div>
                          <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">No messages found</h3>
                          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            Try a different keyword or clear the thread search to see the full conversation.
                          </p>
                        </div>
                      ) : (
                        groupedMessages.map((group) => (
                          <div key={group.dateKey} className="space-y-2">
                            <div className="flex justify-center">
                              <span className="rounded-full border border-white/80 bg-white/92 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/92 dark:text-slate-400">
                                {group.label}
                              </span>
                            </div>

                            <div className="space-y-1">
                              {group.messages.map((message, index) => {
                                const previousMessage = group.messages[index - 1];
                                const showAvatar = !previousMessage || !isSameDay(new Date(previousMessage.created_at), new Date(message.created_at)) || Number(previousMessage.user_id) !== Number(message.user_id);

                                return (
                                  <MessageBubble
                                    key={message.id}
                                    message={message}
                                    isMe={Number(message.user_id) === Number(user?.id)}
                                    showAvatar={showAvatar}
                                    onToggleReaction={handleToggleReaction}
                                    participants={conversationParticipants}
                                    searchQuery={deferredThreadSearchQuery}
                                    mentionLookups={mentionLookups}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}

                      <AnimatePresence>
                        {typingNames.length > 0 && !deferredThreadSearchQuery.trim() && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            className="flex items-center gap-3 rounded-full border border-emerald-100 bg-white/88 px-4 py-2 text-xs font-medium text-emerald-600 shadow-sm backdrop-blur dark:border-emerald-900/40 dark:bg-zinc-900/88 dark:text-emerald-300"
                          >
                            <div className="flex gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "120ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "240ms" }} />
                            </div>
                            <span>
                              {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing...
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="border-t border-white/70 bg-white/76 px-4 py-2 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/76 md:px-6">
                    <div className="mx-auto max-w-4xl">
                      {attachments.length > 0 && (
                        <div className="scrollbar-hide mb-4 flex gap-3 overflow-x-auto pb-1">
                          {attachments.map((file, index) => {
                            const previewUrl = attachmentPreviewUrls[index];
                            const isImage = file.type.startsWith("image/");
                            const isVideo = file.type.startsWith("video/");
                            const fileKind = getFileKindLabel(file);
                            const fileSize = formatFileSize(file.size);

                            return (
                              <div
                                key={`${file.name}-${file.lastModified}-${index}`}
                                className="relative w-40 shrink-0 overflow-hidden rounded-[22px] border border-slate-200 bg-white p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
                              >
                                {isImage && previewUrl ? (
                                  <div className="overflow-hidden rounded-2xl">
                                    <img src={previewUrl} alt={file.name} className="h-24 w-full object-cover" loading="lazy" />
                                  </div>
                                ) : isVideo && previewUrl ? (
                                  <div className="overflow-hidden rounded-2xl">
                                    <video src={previewUrl} className="h-24 w-full bg-slate-950 object-cover" preload="metadata" muted />
                                  </div>
                                ) : (
                                  <div className="flex h-24 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-slate-300">
                                    <FiFileText className="h-6 w-6" />
                                  </div>
                                )}

                                <div className="mt-2 px-1">
                                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-100">{file.name}</p>
                                  <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                                    {[fileKind, fileSize].filter(Boolean).join(" · ")}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setAttachments((previous) => previous.filter((_, currentIndex) => currentIndex !== index))}
                                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/80 text-white transition hover:bg-slate-950"
                                >
                                  <FiX className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <form
                        onSubmit={handleSendMessage}
                        onDragOver={handleDragOverAttachments}
                        onDragLeave={handleDragLeaveAttachments}
                        onDrop={handleDropAttachments}
                        className={`relative rounded-[22px] border p-2 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.7)] backdrop-blur-xl transition ${
                          isDraggingFiles
                            ? "border-sky-400 bg-sky-50/95 ring-4 ring-sky-200/60 dark:border-sky-500 dark:bg-sky-950/40 dark:ring-sky-900/50"
                            : "border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,250,252,0.98))] dark:border-zinc-700 dark:bg-[linear-gradient(135deg,rgba(24,24,27,0.96),rgba(9,9,11,0.96))]"
                        }`}
                      >
                        {isDraggingFiles && (
                          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[24px] border-2 border-dashed border-sky-400 bg-sky-50/92 text-sky-700 shadow-inner backdrop-blur-sm dark:border-sky-500 dark:bg-sky-950/88 dark:text-sky-100">
                            <div className="text-center">
                              <FiUploadCloud className="mx-auto h-7 w-7" />
                              <p className="mt-2 text-sm font-semibold">Drop images, videos, or files to attach</p>
                              <p className="mt-1 text-xs text-sky-600 dark:text-sky-200/80">They will be sent with this message.</p>
                            </div>
                          </div>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleAddAttachments}
                        />

                        <div className="flex items-end gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800"
                            title="Add attachments"
                          >
                            <FiPaperclip className="h-5 w-5" />
                          </button>

                          <div className="min-w-0 flex-1 rounded-[18px] border border-slate-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                            <textarea
                              ref={composerTextareaRef}
                              value={messageBody}
                              onChange={(event) => {
                                setMessageBody(event.target.value);
                                syncComposerSelection(event);
                                sendTyping(true);

                                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                typingTimeoutRef.current = window.setTimeout(() => {
                                  sendTyping(false);
                                }, 1800);
                              }}
                              onKeyDown={(event) => {
                                if (activeMentionSuggestions.length > 0) {
                                  if (event.key === "ArrowDown") {
                                    event.preventDefault();
                                    setActiveMentionIndex((previous) => (previous + 1) % activeMentionSuggestions.length);
                                    return;
                                  }

                                  if (event.key === "ArrowUp") {
                                    event.preventDefault();
                                    setActiveMentionIndex((previous) => (
                                      previous - 1 < 0 ? activeMentionSuggestions.length - 1 : previous - 1
                                    ));
                                    return;
                                  }

                                  if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
                                    event.preventDefault();
                                    handleSelectMention(activeMentionSuggestions[activeMentionIndex] || activeMentionSuggestions[0]);
                                    return;
                                  }
                                }

                                if (event.key === "Enter" && !event.shiftKey) {
                                  event.preventDefault();
                                  handleSendMessage(event);
                                }
                              }}
                              onClick={syncComposerSelection}
                              onKeyUp={syncComposerSelection}
                              onSelect={syncComposerSelection}
                              rows={1}
                              placeholder="Write a message..."
                              className="max-h-32 min-h-[24px] w-full resize-none border-0 bg-transparent p-0 text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                            />

                            <MentionSuggestions
                              suggestions={activeMentionSuggestions}
                              activeIndex={activeMentionIndex}
                              onSelect={handleSelectMention}
                            />

                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  <FiClock className="h-3.5 w-3.5" />
                                  Enter to send
                                </span>
                                <span>Shift + Enter for new line</span>
                                <span>@ mention teammates</span>
                                <span># reference tasks</span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                {attachments.length > 0 && (
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-zinc-800">
                                    {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
                                  </span>
                                )}
                                {messageBody.trim() && (
                                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200">
                                    Draft ready
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={isSending || (!messageBody.trim() && attachments.length === 0)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_24px_60px_-34px_rgba(15,23,42,1)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none dark:bg-white dark:text-slate-950"
                            title="Send message"
                          >
                            <FiSend className={`h-5 w-5 ${isSending ? "animate-pulse" : ""}`} />
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {showInfo && (
                    <>
                      <motion.button
                        type="button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowInfo(false)}
                        className="absolute inset-0 z-20 bg-slate-950/20 backdrop-blur-sm lg:hidden"
                      />

                      <motion.aside
                        initial={{ x: "100%", opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "100%", opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="absolute inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col border-l border-white/70 bg-white/88 backdrop-blur-2xl dark:border-zinc-800 dark:bg-zinc-950/92"
                      >
                        <div className="flex items-center justify-between border-b border-white/70 px-5 py-4 dark:border-zinc-800">
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-sky-500">Conversation</p>
                            <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Details & shared files</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowInfo(false)}
                            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800"
                          >
                            <FiX className="h-4.5 w-4.5" />
                          </button>
                        </div>

                        <div className="scrollbar-hide flex-1 overflow-y-auto px-5 py-5">
                          <div className="rounded-[28px] border border-white/70 bg-white/72 p-5 text-center shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)] dark:border-zinc-800 dark:bg-zinc-900/72">
                            {activeConversation.conversation_type === "direct" ? (
                              <Avatar name={activeConversationName} src={activeConversationImage} size="xl" className="mx-auto" />
                            ) : (
                              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-cyan-50 text-sky-700 dark:from-sky-950/60 dark:to-cyan-950/40 dark:text-sky-200">
                                <FiUsers className="h-8 w-8" />
                              </div>
                            )}

                            <h4 className="mt-4 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{activeConversationName}</h4>
                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                              {activeConversation.conversation_type === "group"
                                ? "Shared room for ongoing collaboration"
                                : `Private chat${activeConversationOtherParticipant?.job_title ? ` • ${activeConversationOtherParticipant.job_title}` : ""}`}
                            </p>

                            <div className="mt-5 grid grid-cols-3 gap-3 text-left">
                              <StatCard icon={<FiMessageSquare className="h-4 w-4" />} label="Messages" value={activeConversationMessages.length} accentClass="bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-slate-200" />
                              <StatCard icon={<FiPaperclip className="h-4 w-4" />} label="Files" value={sharedAttachments.length} accentClass="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200" />
                              <StatCard icon={<FiUsers className="h-4 w-4" />} label="Members" value={activeConversation.participants?.length || 0} accentClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200" />
                            </div>
                          </div>

                          <section className="mt-6">
                            <div className="mb-3 flex items-center gap-2">
                              <FiUsers className="h-4 w-4 text-slate-400" />
                              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
                                Members ({activeConversation.participants?.length || 0})
                              </p>
                            </div>

                            <div className="space-y-3">
                              {(activeConversation.participants || []).map((participant) => (
                                <div
                                  key={participant.id}
                                  className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/72 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/72"
                                >
                                  <Avatar name={participant.name} src={participant.profile_picture} size="sm" />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{participant.name}</p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      {formatParticipantStatus(participant, user?.id)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>


                          <section className="mt-6">
                            <div className="mb-3 flex items-center gap-2">
                              <FiZap className="h-4 w-4 text-slate-400" />
                              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">Conversation controls</p>
                            </div>

                            <div className="space-y-2 rounded-[24px] border border-sky-100 bg-sky-50/70 p-3 dark:border-sky-950/60 dark:bg-sky-950/20">
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleStartCall("audio")}
                                  disabled={isCallConnecting || Boolean(visibleCall)}
                                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
                                >
                                  <FiPhone className="h-4 w-4" />
                                  Voice
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartCall("video")}
                                  disabled={isCallConnecting || Boolean(visibleCall)}
                                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
                                >
                                  <FiVideo className="h-4 w-4" />
                                  Video
                                </button>
                              </div>

                              {activeConversation.muted ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnmuteConversation(activeConversation)}
                                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
                                >
                                  <FiBellOff className="h-4 w-4" />
                                  Unmute conversation
                                </button>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  {MUTE_OPTIONS.map((option) => (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => handleMuteConversation(activeConversation, option.id)}
                                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
                                    >
                                      {option.label.replace("Mute ", "")}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </section>

                          <section className="mt-6">
                            <div className="mb-3 flex items-center gap-2">
                              <FiPaperclip className="h-4 w-4 text-slate-400" />
                              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">Shared files</p>
                            </div>

                            {sharedAttachments.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/72 p-4 text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/72 dark:text-slate-400">
                                No shared files in this conversation yet.
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {sharedAttachments.slice(0, 8).map((attachment) => {
                                  const isImage = attachment.content_type?.startsWith("image/");
                                  const isVideo = attachment.content_type?.startsWith("video/");
                                  const fileSize = formatFileSize(attachment.byte_size);
                                  const iconClass = isImage
                                    ? "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200"
                                    : isVideo
                                      ? "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200"
                                      : "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-slate-200";

                                  return (
                                    <div
                                      key={`${attachment.message_id}-${attachment.id}`}
                                      className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/72 px-3 py-3 transition hover:-translate-y-0.5 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/72 dark:hover:bg-zinc-900"
                                    >
                                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconClass}`}>
                                        {isImage ? <FiImage className="h-5 w-5" /> : isVideo ? <FiVideo className="h-5 w-5" /> : <FiFileText className="h-5 w-5" />}
                                      </div>

                                      <a href={attachment.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1" title={`Open ${attachment.filename}`}>
                                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{attachment.filename}</p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                          {[attachment.sender_name, formatDistanceToNow(new Date(attachment.sent_at), { addSuffix: true }), fileSize].filter(Boolean).join(" • ")}
                                        </p>
                                      </a>

                                      <a
                                        href={attachment.download_url || attachment.url}
                                        download={attachment.filename}
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
                                        title={`Download ${attachment.filename}`}
                                        aria-label={`Download ${attachment.filename}`}
                                      >
                                        <FiDownload className="h-4 w-4" />
                                      </a>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </section>
                        </div>
                      </motion.aside>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </main>
      </div>

      <AnimatePresence>
        {incomingCall && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-white/80 bg-white p-6 text-center shadow-[0_40px_90px_-45px_rgba(15,23,42,1)] dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200">
                {incomingCall.call_type === "audio" ? <FiPhoneCall className="h-8 w-8" /> : <FiVideo className="h-8 w-8" />}
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.28em] text-sky-500">
                Incoming {incomingCall.call_type === "audio" ? "voice" : "video"} call
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {incomingCall.initiator_name}
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {incomingCall.participants?.length || 0} participant{incomingCall.participants?.length === 1 ? "" : "s"} invited
              </p>

              {callError && <p className="mt-4 rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-950/30 dark:text-red-200">{callError}</p>}

              <div className="mt-7 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleDeclineCall(incomingCall)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  <FiPhoneOff className="h-4 w-4" />
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => handleJoinCall(incomingCall)}
                  disabled={isCallConnecting}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <FiPhone className="h-4 w-4" />
                  {isCallConnecting ? "Joining..." : "Accept"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <CallRoom
        callSession={activeCall}
        credentials={callCredentials}
        onLeave={handleLeaveCall}
        onRetry={handleRetryCallConnection}
        onConnectionError={handleCallConnectionError}
        onConnected={handleCallConnected}
      />

      <AnimatePresence>
        {isNewChatModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
              onClick={() => setIsNewChatModalOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="relative z-10 flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border border-white/70 bg-white/95 shadow-[0_40px_90px_-50px_rgba(15,23,42,1)] backdrop-blur-2xl dark:border-zinc-800 dark:bg-zinc-950/95"
            >
              <div className="border-b border-white/70 px-6 py-5 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-sky-500">New conversation</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                      {newChatMode === "group" ? "Create a shared room" : "Start a direct chat"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {newChatMode === "group"
                        ? "Pick at least two people, then name the room."
                        : "Choose one teammate and jump straight into the thread."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsNewChatModalOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800"
                  >
                    <FiX className="h-4.5 w-4.5" />
                  </button>
                </div>

                <div className="mt-5 flex gap-2">
                  {NEW_CHAT_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => resetNewChatModal(mode.id)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        newChatMode === mode.id
                          ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {newChatStep === "select" ? (
                <>
                  <div className="border-b border-white/70 px-6 py-4 dark:border-zinc-800">
                    <div className="relative">
                      <FiSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search by name, email, or title"
                        className="w-full rounded-2xl border border-white/70 bg-white py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-100 dark:focus:border-sky-700 dark:focus:ring-sky-950/50"
                        autoFocus
                      />
                    </div>

                    {selectedUsers.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedUsers.map((selectedUser) => (
                          <button
                            key={selectedUser.id}
                            type="button"
                            onClick={() => handleSelectUser(selectedUser.id)}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"
                          >
                            <span>{getFullUserName(selectedUser)}</span>
                            <FiX className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="scrollbar-hide flex-1 overflow-y-auto px-4 py-4">
                    <div className="grid gap-2">
                      {filteredUsers.map((candidate) => {
                        const selected = selectedUserIds.includes(candidate.id);

                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => handleSelectUser(candidate.id)}
                            className={`flex items-center gap-4 rounded-[24px] border px-4 py-3 text-left transition ${
                              selected
                                ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_45px_-30px_rgba(15,23,42,1)] dark:border-white dark:bg-white dark:text-slate-950"
                                : "border-white/70 bg-white/78 hover:border-slate-200 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/75 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                            }`}
                          >
                            <Avatar name={getFullUserName(candidate)} src={candidate.profile_picture} size="md" />

                            <div className="min-w-0 flex-1">
                              <p className={`truncate text-sm font-semibold ${selected ? "text-current" : "text-slate-900 dark:text-white"}`}>
                                {getFullUserName(candidate)}
                              </p>
                              <p className={`mt-1 truncate text-xs ${selected ? "text-white/75 dark:text-slate-600" : "text-slate-500 dark:text-slate-400"}`}>
                                {candidate.job_title || candidate.email}
                              </p>
                            </div>

                            <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${selected ? "border-current bg-white/10 dark:bg-slate-100" : "border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"}`}>
                              {selected ? <FiCheck className="h-4 w-4" /> : <FiHash className="h-4 w-4 text-slate-300 dark:text-slate-600" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {filteredUsers.length === 0 && (
                      <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/76 p-6 text-center text-sm text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/72 dark:text-slate-400">
                        No people match that search.
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-white/70 bg-slate-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {newChatMode === "group"
                        ? `${selectedUserIds.length} selected • choose at least 2`
                        : selectedUserIds[0]
                          ? "1 person selected"
                          : "Choose 1 person"}
                    </div>

                    <button
                      type="button"
                      onClick={handleContinueNewChat}
                      disabled={newChatMode === "group" ? selectedUserIds.length < 2 : !selectedUserIds[0]}
                      className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40 dark:bg-white dark:text-slate-950"
                    >
                      {newChatMode === "group" ? "Continue" : "Start chat"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col">
                  <div className="scrollbar-hide flex-1 overflow-y-auto px-6 py-6">
                    <div className="rounded-[28px] border border-white/70 bg-white/78 p-5 dark:border-zinc-800 dark:bg-zinc-900/75">
                      <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">Selected members</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedUsers.map((selectedUser) => (
                          <span
                            key={selectedUser.id}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"
                          >
                            {getFullUserName(selectedUser)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 rounded-[28px] border border-white/70 bg-white/78 p-5 dark:border-zinc-800 dark:bg-zinc-900/75">
                      <label className="block text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
                        Group name
                      </label>
                      <input
                        value={newGroupTitle}
                        onChange={(event) => setNewGroupTitle(event.target.value)}
                        placeholder="e.g. Product Launch, Design Reviews, Sprint Room"
                        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-slate-100 dark:focus:border-sky-700 dark:focus:ring-sky-950/50"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/70 bg-slate-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <button
                      type="button"
                      onClick={() => setNewChatStep("select")}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800"
                    >
                      Back
                    </button>

                    <button
                      type="button"
                      onClick={handleContinueNewChat}
                      disabled={!newGroupTitle.trim()}
                      className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40 dark:bg-white dark:text-slate-950"
                    >
                      Create group
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Chat;
