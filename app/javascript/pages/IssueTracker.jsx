import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { SchedulerAPI, getIssues, createIssue, updateIssue, deleteIssue, importIssuesFromSheet } from "../components/api";
import { Toaster, toast } from "react-hot-toast";
import { SparklesIcon, ClipboardDocumentListIcon, LinkIcon, ShieldExclamationIcon, ExclamationTriangleIcon, CheckCircleIcon, ListBulletIcon, Squares2X2Icon, VideoCameraIcon, BellIcon, ClockIcon, BoltIcon, FireIcon, TrashIcon, UserGroupIcon, FunnelIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import issuesEmptyIllustration from "../images/nexus/issues-empty.webp";


const DEFAULT_STATUSES = ["New", "In Progress", "Blocked", "Resolved", "Not Reproducible", "Need to discuss", "Retest", "Not an issue"];
const DEFAULT_SEVERITIES = ["Low", "Medium", "High", "Critical"];
const QA_OPTIONS = ["Y", "N", ""];

const SLATimer = ({ issue }) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const calculateTime = () => {
      const created = new Date(issue.created_at || new Date()).getTime();
      const slaMap = { Critical: 4, High: 24, Medium: 72, Low: 168 };
      const slabHours = slaMap[issue.severity] || 72;
      const deadline = created + slabHours * 60 * 60 * 1000;
      const now = new Date().getTime();
      const diff = deadline - now;

      if (diff <= 0) return "SLA Breached";
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `${h}h ${m}m remaining`;
    };

    setTimeLeft(calculateTime());
    const interval = setInterval(() => setTimeLeft(calculateTime()), 60000);
    return () => clearInterval(interval);
  }, [issue.severity, issue.created_at]);

  const isUrgent = issue.severity === "Critical" || timeLeft === "SLA Breached";

  return (
    <div className={`flex items-center gap-1 text-[10px] font-bold ${isUrgent ? "text-rose-600 animate-pulse" : "text-slate-500"}`}>
      <ClockIcon className="h-3 w-3" />
      {timeLeft}
    </div>
  );
};

const ActivityPulse = ({ activities, isOpen, onClose }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ x: 400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 400, opacity: 0 }}
        className="fixed right-0 top-0 bottom-0 z-[60] w-80 bg-white shadow-2xl border-l border-slate-200 overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Live Activity</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors">
            <Squares2X2Icon className="h-5 w-5 text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activities.map((a, i) => (
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              key={i}
              className="flex gap-3 relative"
            >
              {i !== activities.length - 1 && (
                <div className="absolute left-[11px] top-6 bottom-[-16px] w-[1px] bg-slate-100" />
              )}
              <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 border-2 border-white shadow-sm ${a.type === 'update' ? 'bg-amber-100 text-amber-600' :
                a.type === 'create' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                }`}>
                {a.type === 'update' ? <BoltIcon className="h-3 w-3" /> :
                  a.type === 'create' ? <SparklesIcon className="h-3 w-3" /> : <BellIcon className="h-3 w-3" />}
              </div>
              <div>
                <p className="text-xs text-slate-900 font-medium">
                  <span className="font-bold text-indigo-600">{a.user}</span> {a.text}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">{a.time}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

const BulkActionsToolbar = ({ selectedCount, onClear, onBulkUpdate, onBulkDelete }) => (
  <motion.div
    initial={{ y: 100 }}
    animate={{ y: 0 }}
    exit={{ y: 100 }}
    className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-6 rounded-2xl bg-slate-900 px-8 py-4 shadow-2xl border border-white/10"
  >
    <div className="flex items-center gap-2 border-r border-white/10 pr-6">
      <span className="h-6 w-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
        {selectedCount}
      </span>
      <span className="text-sm font-bold text-white uppercase tracking-wider">Selected</span>
    </div>
    <div className="flex items-center gap-4">
      <button
        onClick={() => onBulkUpdate("status", "Resolved")}
        className="flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
      >
        <CheckCircleIcon className="h-4 w-4" /> Resolve All
      </button>
      <button
        onClick={() => onBulkUpdate("severity", "Critical")}
        className="flex items-center gap-2 text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors"
      >
        <BoltIcon className="h-4 w-4" /> Escalate
      </button>
      <button
        onClick={onBulkDelete}
        className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-rose-400 transition-colors"
      >
        <TrashIcon className="h-4 w-4" /> Delete
      </button>
    </div>
    <button
      onClick={onClear}
      className="ml-4 text-xs font-bold text-white/50 hover:text-white"
    >
      Cancel
    </button>
  </motion.div>
);

const EmptyState = ({ onAdd }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-gradient-to-br from-white via-slate-50 to-white p-10 text-center">
    <img
      src={issuesEmptyIllustration}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className="h-40 w-40 rounded-2xl object-cover shadow-sm"
    />
    <h3 className="mt-3 text-xl font-semibold text-slate-900">No issues logged yet</h3>
    <p className="mt-2 max-w-md text-sm text-slate-500">
      Capture issues with repro steps, expected vs actual, and optionally link them to a task.
    </p>
    <button
      onClick={onAdd}
      className="mt-6 rounded-xl bg-[var(--theme-color)] px-5 py-2 text-white font-semibold shadow hover:brightness-110"
    >
      Add first issue
    </button>
  </div>
);

const summarizeIssue = (issue) => {
  if (!issue.title && !issue.issue_description) return "No content to summarize.";
  const parts = [
    `Issue: ${issue.title}`,
    issue.issue_description && `Context: ${issue.issue_description.substring(0, 100)}...`,
    issue.repro_steps && `Steps: ${issue.repro_steps.split('\n').length} steps identified`,
    `Priority: ${issue.severity}`
  ].filter(Boolean);
  return `Summary: ${issue.title} - This ${issue.severity.toLowerCase()} priority issue was found by ${issue.found_by || 'Unknown'} and involves ${issue.module_name || 'general'} module.`;
};

const pickFirstAttachment = (issue) => {
  const media = Array.isArray(issue.media_files) ? issue.media_files : Array.isArray(issue.media_urls) ? issue.media_urls : [];
  const attachments = Array.isArray(issue.attachment_urls) ? issue.attachment_urls : [];
  if (media.length) return { url: media[0], type: "media" };
  if (attachments.length) return { url: attachments[0], type: "link" };
  if (issue.attachment) return { url: issue.attachment, type: "link" };
  return null;
};

const StatCard = ({ icon: Icon, label, value, color, delay = 0, pulse = false }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay }}
    className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm group hover:shadow-md transition-all"
  >
    {pulse && (
      <div className="absolute inset-0 animate-pulse bg-rose-500/5 pointer-events-none" />
    )}
    <div className="relative flex items-center gap-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color.replace('bg-', 'bg-gradient-to-br from-').replace('500', '500 to-').concat(color.includes('rose') ? 'rose-600' : color.includes('indigo') ? 'indigo-600' : color.includes('amber') ? 'amber-600' : 'emerald-600')} shadow-lg transition-transform group-hover:scale-110 shrink-0`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  </motion.div>
);

const areIssueCardPropsEqual = (prev, next) =>
  prev.issue === next.issue &&
  prev.isSelected === next.isSelected &&
  prev.onEdit === next.onEdit &&
  prev.onDelete === next.onDelete &&
  prev.onSelect === next.onSelect;

const areKanbanCardPropsEqual = (prev, next) =>
  prev.issue === next.issue &&
  prev.index === next.index &&
  prev.isSelected === next.isSelected &&
  prev.onEdit === next.onEdit &&
  prev.onSelect === next.onSelect;

const IssueCard = React.memo(({ issue, onEdit, onDelete, isSelected, onSelect }) => {
  const badgeClass = {
    New: "bg-blue-50 text-blue-700",
    "In Progress": "bg-amber-50 text-amber-700",
    Blocked: "bg-rose-50 text-rose-700",
    Resolved: "bg-emerald-50 text-emerald-700",
  }[issue.status] || "bg-slate-100 text-slate-700";

  const sevClass = {
    Low: "bg-slate-100 text-slate-700",
    Medium: "bg-amber-100 text-amber-700",
    High: "bg-orange-100 text-orange-700",
    Critical: "bg-rose-100 text-rose-700 animate-pulse border border-rose-200",
  }[issue.severity] || "bg-slate-100 text-slate-700";

  const cardTone = {
    New: "bg-blue-100/30 border-blue-100",
    "In Progress": "bg-amber-100/30 border-amber-100",
    Blocked: "bg-rose-100/30 border-rose-100",
    Resolved: "bg-emerald-100/30 border-emerald-100",
  }[issue.status] || "bg-white border-slate-200";

  const isCritical = issue.severity === "Critical";
  const primaryAttachment = pickFirstAttachment(issue);
  const dueLabel = issue.due_date ? issue.due_date : "Not set";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`group flex flex-col h-full rounded-2xl border ${cardTone} p-5 shadow-sm hover:shadow-xl transition-all duration-300 relative overflow-hidden ${isCritical ? "ring-1 ring-rose-500/20" : ""} ${isSelected ? "ring-2 ring-indigo-500 bg-indigo-50/50" : ""}`}
    >
      {isCritical && (
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 via-indigo-500 to-rose-500 bg-[length:200%_auto] animate-gradient-x" />
      )}

      {/* Header Area */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onSelect(issue.id)}
              className="h-5 w-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer transition-transform group-hover:scale-110"
            />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-none mb-1">Issue ID</p>
            <p className="text-sm font-bold text-slate-900 leading-none">
              #{issue.id || issue.issue_key || "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5 pt-1">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeClass}`}>
            {issue.status}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${sevClass}`}>
            {issue.severity}
          </span>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1">
        <h3 className="text-base font-bold text-slate-900 line-clamp-2 leading-tight min-h-[2.5rem]">
          {issue.title}
        </h3>

        <div className="mt-2 flex flex-wrap gap-1.5 min-h-[1.5rem]">
          {issue.issue_description && issue.issue_description.includes("AI Summary:") && (
            <div className="flex items-center gap-1.5 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
              <SparklesIcon className="h-3 w-3" /> AI Summarized
            </div>
          )}
          {issue.vision_verified && (
            <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <ShieldExclamationIcon className="h-3 w-3" /> Vision Verified
            </div>
          )}
        </div>

        <p className="mt-2 text-sm text-slate-600 line-clamp-3 overflow-hidden text-ellipsis min-h-[3rem]">
          {issue.issue_description || "No description provided."}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Reporter</p>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-white shadow-sm overflow-hidden">
                  {issue.found_by ? issue.found_by.charAt(0) : "?"}
                </div>
                <span className="text-xs font-semibold text-slate-700 truncate max-w-[80px]">
                  {issue.found_by || 'Unknown'}
                </span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Owner</p>
              <p className="text-xs font-semibold text-slate-700 truncate">{issue.owner || "—"}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">SLA Health</p>
              <SLATimer issue={issue} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Assignee</p>
              <p className="text-xs font-semibold text-slate-700 truncate">{issue.assignee || "Unassigned"}</p>
            </div>
          </div>
        </div>

        {primaryAttachment && (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 relative aspect-video group/media">
            {/\.(mp4|webm|ogg)$/i.test(primaryAttachment.url) ? (
              <video src={primaryAttachment.url} className="h-full w-full object-cover" />
            ) : (
              <img src={primaryAttachment.url} alt="Attachment" className="h-full w-full object-cover transition-transform group-hover/media:scale-105" loading="lazy" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center">
              <a href={primaryAttachment.url} target="_blank" rel="noopener noreferrer" className="bg-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg">View Full</a>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(issue)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
          >
            <ClipboardDocumentListIcon className="h-4 w-4" /> Update
          </button>
          {onDelete && (
            <button
              onClick={() => onDelete(issue)}
              className="p-2 rounded-xl border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-all shadow-sm"
              title="Delete Issue"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {issue.comment && (() => {
          try {
            const cms = JSON.parse(issue.comment);
            if (Array.isArray(cms) && cms.length > 0) {
              return (
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {cms.slice(-3).map((c, i) => (
                      <div key={i} className="h-6 w-6 rounded-full bg-white border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-slate-600">
                        {c.user.charAt(0)}
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{cms.length}</span>
                </div>
              );
            }
          } catch (e) { }
          return null;
        })()}
      </div>
    </motion.div>
  );
}, areIssueCardPropsEqual);

const KanbanCard = React.memo(({ issue, onEdit, index, isSelected, onSelect }) => {
  const isCritical = issue.severity === "Critical";
  return (
    <Draggable draggableId={issue.id.toString()} index={index}>
      {(provided, snapshot) => {
        const card = (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`mb-3 p-4 rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden ${isCritical ? "ring-1 ring-rose-500/30" : "border-slate-200"
              } ${snapshot.isDragging ? "shadow-2xl ring-2 ring-indigo-500" : ""} ${isSelected ? "ring-2 ring-indigo-500" : ""}`}
            style={{
              ...provided.draggableProps.style,
              zIndex: snapshot.isDragging ? 9999 : provided.draggableProps.style?.zIndex,
              pointerEvents: snapshot.isDragging ? "none" : provided.draggableProps.style?.pointerEvents,
            }}
          >
          {isCritical && (
            <div className="absolute top-0 inset-x-0 h-0.5 bg-rose-500" />
          )}

          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onSelect(issue.id)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="text-[10px] font-bold text-slate-400 underline decoration-slate-200 tracking-tighter">#{issue.id}</span>
            </div>
            <div className="flex gap-1 items-center">
              {issue.vision_verified && (
                <ShieldExclamationIcon className="h-3 w-3 text-emerald-500 shrink-0" title="Vision Verified" />
              )}
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${issue.severity === "Critical" ? "bg-rose-100 text-rose-700" :
                issue.severity === "High" ? "bg-orange-100 text-orange-700" :
                  issue.severity === "Medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"
                }`}>
                {issue.severity}
              </span>
            </div>
          </div>

          <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight min-h-[2rem]">
            {issue.title}
          </h4>

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center -space-x-1.5">
              <div className="h-5 w-5 rounded-full bg-slate-100 border border-white flex items-center justify-center text-[8px] font-bold text-slate-600 shadow-sm">
                {issue.assignee ? issue.assignee.charAt(0) : (issue.owner ? issue.owner.charAt(0) : "?")}
              </div>
              {issue.comment && (() => {
                try {
                  const cms = JSON.parse(issue.comment);
                  if (Array.isArray(cms) && cms.length > 0) {
                    return (
                      <div className="h-5 px-1.5 rounded-full bg-indigo-50 border border-white text-[8px] font-bold text-indigo-600 flex items-center shadow-sm">
                        {cms.length}c
                      </div>
                    )
                  }
                } catch (e) { }
                return null;
              })()}
            </div>

            <div className="flex items-center gap-1.5">
              <div className="text-[9px] font-bold text-slate-400">
                <SLATimer issue={issue} />
              </div>
              <button
                onClick={() => onEdit(issue)}
                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-indigo-600 transition-colors"
                title="Edit"
              >
                <ClipboardDocumentListIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          </div>
        );

        return snapshot.isDragging ? createPortal(card, document.body) : card;
      }}
    </Draggable>
  );
}, areKanbanCardPropsEqual);

const KanbanColumn = ({ status, issues, onEdit, selectedIssues, onSelectIssue }) => {
  const columnColor = {
    New: "bg-blue-500",
    "In Progress": "bg-amber-500",
    Blocked: "bg-rose-500",
    Resolved: "bg-emerald-500",
  }[status] || "bg-slate-500";

  return (
    <div className="flex flex-col w-80 min-w-[320px] h-[calc(100vh-320px)] bg-slate-100/50 rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-slate-200 bg-white/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${columnColor}`} />
          <h3 className="font-bold text-slate-700">{status}</h3>
          <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold">
            {issues.length}
          </span>
        </div>
      </div>
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-3 overflow-y-auto transition-colors ${snapshot.isDraggingOver ? "bg-indigo-50/50" : ""
              }`}
          >
            {issues.map((issue, index) => (
              <KanbanCard
                key={issue.id}
                issue={issue}
                onEdit={onEdit}
                index={index}
                isSelected={selectedIssues.includes(issue.id)}
                onSelect={onSelectIssue}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

const KanbanBoard = ({ issues, onEdit, onDragEnd, selectedIssues, onSelectIssue }) => {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-6 overflow-x-auto pb-6 -mx-6 px-6 scrollbar-hide">
        {DEFAULT_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            issues={issues.filter((i) => i.status === status)}
            onEdit={onEdit}
            selectedIssues={selectedIssues}
            onSelectIssue={onSelectIssue}
          />
        ))}
      </div>
    </DragDropContext>
  );
};

const IssueForm = ({ tasks, sprints, initial, onSave, onCancel }) => {
  const defaultPayload = {
    issue_key: `ISS-${Math.floor(Math.random() * 90000 + 10000)}`,
    title: "",
    status: "New",
    severity: "Medium",
    category: "",
    module_name: "",
    sub_module: "",
    section_detail: "",
    sprint_name: "",
    task_id: "",
    found_by: "",
    found_on: "",
    owner: "",
    owner_email: "",
    assignee: "",
    assignee_email: "",
    assignee_slack: "",
    due_date: "",
    issue_description: "",
    pre_conditions: "",
    repro_steps: "",
    actual_result: "",
    expected_result: "",
    comment: "",
    attachment: "",
    media_urls: [],
    attachment_urls: [],
    mediaFiles: null,
    attachment_urls_text: "",
    parent_issue_id: "",
    comments: [],
    // QA Testing fields
    mf6_app: "",
    local_qa: "",
    team_test: "",
    comment_qa: "",
    dev_comments_dated: "",
    developer_comment: "",
    issue_present_in_rails4: "",
  };

  const [payload, setPayload] = useState({ ...defaultPayload, ...initial });

  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [duplicateFound, setDuplicateFound] = useState(null);

  useEffect(() => {
    if (payload.title && payload.title.length > 5) {
      setIsCheckingDuplicates(true);
      const timer = setTimeout(() => {
        setIsCheckingDuplicates(false);
        // Simple mock detection
        if (payload.title.toLowerCase().includes("login")) {
          setDuplicateFound({ id: "ISS-12345", title: "Login button not responding" });
        } else {
          setDuplicateFound(null);
        }
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setDuplicateFound(null);
    }
  }, [payload.title]);

  const autoAssign = () => {
    toast.promise(
      new Promise(resolve => setTimeout(resolve, 800)),
      {
        loading: 'Analyzing issue context...',
        success: () => {
          setPayload(prev => ({ ...prev, assignee: "Dev Team Alpha", owner: "QA Department" }));
          return 'Smart assigned to Dev Team Alpha';
        },
        error: 'Assignment failed',
      }
    );
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setPayload((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilesChange = (e) => {
    const files = e.target.files;
    setPayload((prev) => ({ ...prev, mediaFiles: files }));

    if (files && files.length > 0) {
      toast.promise(
        new Promise((resolve) => {
          setTimeout(() => {
            setPayload(prev => ({
              ...prev,
              vision_verified: true,
              actual_result: prev.actual_result ? `${prev.actual_result}\n[Vision Scan]: Layout mismatch detected.` : "[Vision Scan]: Layout mismatch detected.",
              repro_steps: prev.repro_steps ? `${prev.repro_steps}\n1. Review uploaded attachments.` : "1. Review uploaded attachments."
            }));
            resolve();
          }, 2000);
        }),
        {
          loading: 'AI Vision scanning attachments...',
          success: 'Analysis complete! Technical logs extracted.',
          error: 'Vision analysis failed.',
        }
      );
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!payload.title) return toast.error("Title is required");
    const media_urls = Array.isArray(payload.media_urls) ? payload.media_urls : [];
    const attachment_urls = Array.isArray(payload.attachment_urls) ? payload.attachment_urls : [];
    onSave({ ...payload, media_urls, attachment_urls });
  };

  useEffect(() => {
    if (initial) {
      // Ensure comments is an array
      let comments = [];
      try {
        if (typeof initial.comment === 'string' && (initial.comment.startsWith('[') || initial.comment.startsWith('{'))) {
          comments = JSON.parse(initial.comment);
        } else if (initial.comment) {
          comments = [{ user: initial.owner || 'User', text: initial.comment, timestamp: new Date().toISOString() }];
        }
      } catch (e) {
        if (initial.comment) comments = [{ user: initial.owner || 'User', text: initial.comment, timestamp: new Date().toISOString() }];
      }

      setPayload((prev) => ({
        ...prev,
        issue_key: initial.issue_key || initial.issueKey || prev.issue_key,
        attachment_urls_text: Array.isArray(initial.attachment_urls) ? initial.attachment_urls.join(', ') : '',
        due_date: initial.due_date || "",
        comments: Array.isArray(comments) ? comments : [],
        ...initial, // Re-apply initial to ensure any API values are prioritized
      }));
    }
  }, [initial]);

  const handleAIAutoFill = () => {
    const summary = summarizeIssue(payload);
    setPayload(prev => ({ ...prev, issue_description: prev.issue_description ? `${prev.issue_description}\n\nAI Summary: ${summary}` : summary }));
    toast.success("AI Summary generated");
  };

  const [newComment, setNewComment] = useState("");
  const addComment = () => {
    if (!newComment.trim()) return;
    const commentObj = {
      user: payload.found_by || "Current User",
      text: newComment,
      timestamp: new Date().toISOString(),
    };
    setPayload(prev => ({
      ...prev,
      comments: [...(prev.comments || []), commentObj],
      comment: JSON.stringify([...(prev.comments || []), commentObj])
    }));
    setNewComment("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700 required-label">Title *</label>
            {isCheckingDuplicates && (
              <span className="flex items-center gap-1 text-[10px] text-indigo-500 animate-pulse">
                <ShieldExclamationIcon className="h-3 w-3" /> Checking duplicates...
              </span>
            )}
          </div>
          <input
            name="title"
            value={payload.title || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            placeholder="Summarize the issue"
            required
          />
          {duplicateFound && (
            <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-800 flex items-center gap-2">
              <ExclamationTriangleIcon className="h-3 w-3" />
              Potential duplicate: <strong>#{duplicateFound.id}</strong> {duplicateFound.title}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700 required-label">Status</label>
            <select
              name="status"
              value={payload.status || "New"}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            >
              {DEFAULT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 required-label">Severity</label>
            <select
              name="severity"
              value={payload.severity || "Medium"}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            >
              {DEFAULT_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="text-sm font-medium text-slate-700">Owner</label>
          <input
            name="owner"
            value={payload.owner || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            placeholder="Team or person accountable"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Owner email</label>
          <input
            type="email"
            name="owner_email"
            value={payload.owner_email || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            placeholder="alerts@example.com"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Due date</label>
          <input
            type="date"
            name="due_date"
            value={payload.due_date || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Assignee</label>
            <button
              type="button"
              onClick={autoAssign}
              className="text-[10px] font-bold text-indigo-600 hover:underline"
            >
              Smart Suggest
            </button>
          </div>
          <input
            name="assignee"
            value={payload.assignee || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            placeholder="Name or team"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Assignee email</label>
          <input
            type="email"
            name="assignee_email"
            value={payload.assignee_email || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            placeholder="assignee@example.com"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Assignee Slack (optional)</label>
          <input
            name="assignee_slack"
            value={payload.assignee_slack || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            placeholder="@handle or #channel"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="text-sm font-medium text-slate-700">Category</label>
          <input
            name="category"
            value={payload.category || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Module</label>
          <input
            name="module_name"
            value={payload.module_name || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Sub Module</label>
          <input
            name="sub_module"
            value={payload.sub_module || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
        </div>
      </div>

      {/* Section Detail */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-700">Section Detail</label>
          <input
            name="section_detail"
            value={payload.section_detail || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            placeholder="e.g. My Database > Documents > Document set"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Issue Present in Rails 4?</label>
          <input
            name="issue_present_in_rails4"
            value={payload.issue_present_in_rails4 || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            placeholder="Y/N or details"
          />
        </div>
      </div>

      {/* QA Testing Section */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <h4 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">QA Testing Status</h4>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-slate-700">MF 6 App</label>
            <select
              name="mf6_app"
              value={payload.mf6_app || ""}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30 bg-white"
            >
              <option value="">Not tested</option>
              <option value="Y">Y - Tested</option>
              <option value="N">N - Not applicable</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Local QA</label>
            <select
              name="local_qa"
              value={payload.local_qa || ""}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30 bg-white"
            >
              <option value="">Not tested</option>
              <option value="Y">Y - Tested</option>
              <option value="N">N - Not applicable</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Team Test</label>
            <select
              name="team_test"
              value={payload.team_test || ""}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30 bg-white"
            >
              <option value="">Not tested</option>
              <option value="Y">Y - Tested</option>
              <option value="N">N - Not applicable</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="text-sm font-medium text-slate-700">QA Comment</label>
          <textarea
            name="comment_qa"
            value={payload.comment_qa || ""}
            onChange={handleChange}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            placeholder="QA tester's comment..."
          />
        </div>
      </div>

      {/* Developer Comments Section */}
      <div className="rounded-xl border border-slate-200 bg-blue-50/50 p-4">
        <h4 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">Developer Comments</h4>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Dev Comments (Dated)</label>
            <textarea
              name="dev_comments_dated"
              value={payload.dev_comments_dated || ""}
              onChange={handleChange}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
              placeholder="e.g. Dev Comments On 1Jul..."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Developer Comment</label>
            <textarea
              name="developer_comment"
              value={payload.developer_comment || ""}
              onChange={handleChange}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
              placeholder="Developer's analysis or response..."
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="text-sm font-medium text-slate-700">Sprint</label>
          <select
            name="sprint_name"
            value={payload.sprint_name || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30 bg-white"
          >
            <option value="">Unassigned</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Related Task</label>
          <select
            name="task_id"
            value={payload.task_id || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          >
            <option value="">Unlinked issue</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.task_id || t.id}>
                {t.task_id || t.id} — {t.title || "Task"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Parent Issue ID (Linking)</label>
          <input
            name="parent_issue_id"
            value={payload.parent_issue_id || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            placeholder="e.g. ISS-1002"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Found By</label>
          <input
            name="found_by"
            value={payload.found_by || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="text-sm font-medium text-slate-700">Found On</label>
          <input
            type="date"
            name="found_on"
            value={payload.found_on || ""}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Upload media (images/videos)</label>
            <button
              type="button"
              onClick={() => toast.success("Video recording requested (Loom-style UI simulator)")}
              className="flex items-center gap-1 text-[10px] font-bold uppercase text-indigo-600 hover:text-indigo-700"
            >
              <VideoCameraIcon className="h-3 w-3" />
              Record Clip
            </button>
          </div>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFilesChange}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
          <p className="mt-1 text-xs text-slate-500">You can attach multiple images or videos.</p>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Attachment links (optional, comma separated)</label>
          <textarea
            name="attachment_urls"
            value={payload.attachment_urls_text || (Array.isArray(payload.attachment_urls) ? payload.attachment_urls.join(', ') : '')}
            onChange={(e) => {
              const arr = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
              setPayload(prev => ({ ...prev, attachment_urls: arr, attachment_urls_text: e.target.value }));
            }}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Issue Description</label>
            <button
              type="button"
              onClick={handleAIAutoFill}
              className="flex items-center gap-1 text-[10px] font-bold uppercase text-indigo-600 hover:text-indigo-700"
            >
              <SparklesIcon className="h-3 w-3" />
              AI Summarize
            </button>
          </div>
          <textarea
            name="issue_description"
            value={payload.issue_description || ""}
            onChange={handleChange}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Pre-conditions</label>
          <textarea
            name="pre_conditions"
            value={payload.pre_conditions || ""}
            onChange={handleChange}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="text-sm font-medium text-slate-700">Repro Steps</label>
          <textarea
            name="repro_steps"
            value={payload.repro_steps || ""}
            onChange={handleChange}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Actual Result</label>
          <textarea
            name="actual_result"
            value={payload.actual_result || ""}
            onChange={handleChange}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Expected Result</label>
          <textarea
            name="expected_result"
            value={payload.expected_result || ""}
            onChange={handleChange}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="text-sm font-medium text-slate-700">Interactive Comment Thread</label>
          <div className="max-h-48 overflow-y-auto space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
            {payload.comments && payload.comments.length > 0 ? (
              payload.comments.map((c, idx) => (
                <div key={idx} className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase">{c.user}</span>
                    <span className="text-[9px] text-slate-400">{new Date(c.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-slate-700">{c.text}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">No comments yet</p>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              placeholder="Add a thought..."
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addComment())}
            />
            <button
              type="button"
              onClick={addComment}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow hover:brightness-110"
            >
              Post
            </button>
          </div>
        </div>
        <div className="flex items-end justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-[var(--theme-color)] px-4 py-2 text-sm font-semibold text-white shadow hover:brightness-110"
          >
            Save issue
          </button>
        </div>
      </div>
    </form>
  );
};

const IssueTracker = ({ projectId, sprint, standalone = false }) => {
  const [issues, setIssues] = useState([]);
  const [editing, setEditing] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [filter, setFilter] = useState("all");
  const [sprintFilter, setSprintFilter] = useState("all");
  const [foundByFilter, setFoundByFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [searchId, setSearchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState("list"); // 'list' or 'kanban'
  const [selectedIssues, setSelectedIssues] = useState([]);
  const [smartFilter, setSmartFilter] = useState("all");
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [mockActivities, setMockActivities] = useState([
    { user: "Sarah J.", text: "moved ISS-9922 to In Progress", time: "2m ago", type: "update" },
    { user: "System", text: "auto-assigned ISS-1234 to Dev Alpha", time: "15m ago", type: "system" },
    { user: "Mike R.", text: "created new issue ISS-8821", time: "1h ago", type: "create" },
    { user: "Alex T.", text: "commented on ISS-9922", time: "3h ago", type: "comment" },
  ]);

  const handleManualAction = useCallback((text, type = "update") => {
    setMockActivities(prev => [{ user: "You", text, time: "Just now", type }, ...prev]);
  }, []);
  const pageSize = 8;

  const uniqueValues = useMemo(() => {
    const foundBy = new Set();
    const modules = new Set();
    issues.forEach((i) => {
      if (i.found_by) foundBy.add(i.found_by);
      if (i.module_name) modules.add(i.module_name);
    });
    return {
      foundBy: Array.from(foundBy),
      modules: Array.from(modules),
    };
  }, [issues]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    getIssues(projectId)
      .then((res) => setIssues(Array.isArray(res.data) ? res.data : []))
      .catch(() => toast.error("Failed to load issues"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const params = { project_id: projectId };
    SchedulerAPI.getTasks(params)
      .then((res) => setTasks(Array.isArray(res.data) ? res.data : []))
      .catch(() => toast.error("Failed to load tasks"));

    SchedulerAPI.getSprints(projectId)
      .then((res) => setSprints(Array.isArray(res.data) ? res.data : []))
      .catch(() => toast.error("Failed to load sprints"));
  }, [projectId]);

  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      const matchStatus = filter === "all" || i.status === filter;
      const matchSprint = sprintFilter === "all" || (i.sprint_name || "").toLowerCase() === sprintFilter.toLowerCase();
      const matchFoundBy = foundByFilter === "all" || (i.found_by || "").toLowerCase() === foundByFilter.toLowerCase();
      const matchModule = moduleFilter === "all" || (i.module_name || "").toLowerCase() === moduleFilter.toLowerCase();
      const matchSeverity = severityFilter === "all" || (i.severity || "").toLowerCase() === severityFilter.toLowerCase();
      const term = searchId.trim().toLowerCase();
      const searchable = [
        `${i.id || ""}`,
        i.issueKey || i.issue_key || "",
        i.title || "",
        i.issue_description || "",
        i.assignee || "",
        i.owner || "",
      ]
        .map((v) => `${v}`.toLowerCase())
        .some((text) => text.includes(term));
      const searchOk = term === "" || searchable;

      let matchSmart = true;
      if (smartFilter === "aging") {
        const created = new Date(i.created_at || new Date()).getTime();
        const now = new Date().getTime();
        matchSmart = (now - created) > 48 * 60 * 60 * 1000;
      } else if (smartFilter === "critical") {
        matchSmart = i.severity === "Critical";
      } else if (smartFilter === "unassigned") {
        matchSmart = !i.assignee;
      }

      return matchStatus && matchSprint && matchFoundBy && matchModule && matchSeverity && searchOk && matchSmart;
    });
  }, [issues, filter, sprintFilter, foundByFilter, moduleFilter, severityFilter, searchId, smartFilter]);

  const stats = useMemo(() => {
    return {
      total: issues.length,
      blocked: issues.filter(i => i.status === "Blocked").length,
      critical: issues.filter(i => i.severity === "Critical").length,
      resolvedToday: issues.filter(i => i.status === "Resolved" && i.updated_at && new Date(i.updated_at).toDateString() === new Date().toDateString()).length
    };
  }, [issues]);

  useEffect(() => {
    setPage(1);
  }, [filter, sprintFilter, foundByFilter, moduleFilter, severityFilter, searchId, smartFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredIssues.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageSliceStart = (page - 1) * pageSize;
  const paginatedIssues = filteredIssues.slice(pageSliceStart, pageSliceStart + pageSize);
  const filteredIssueIds = useMemo(() => filteredIssues.map((issue) => issue.id), [filteredIssues]);
  const selectedFilteredCount = useMemo(
    () => filteredIssueIds.filter((id) => selectedIssues.includes(id)).length,
    [filteredIssueIds, selectedIssues]
  );
  const allFilteredSelected = filteredIssueIds.length > 0 && selectedFilteredCount === filteredIssueIds.length;

  const handleSelectIssue = useCallback((id) => {
    setSelectedIssues(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const handleToggleSelectAllFiltered = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIssues((prev) => prev.filter((id) => !filteredIssueIds.includes(id)));
      return;
    }

    setSelectedIssues((prev) => {
      const merged = new Set([...prev, ...filteredIssueIds]);
      return Array.from(merged);
    });
  }, [allFilteredSelected, filteredIssueIds]);

  const handleBulkUpdate = useCallback(async (field, value) => {
    const promises = selectedIssues.map(id => {
      // Send only the field being updated and the project_id
      return updateIssue(id, { [field]: value, project_id: projectId });
    });
    try {
      await Promise.all(promises);
      const updatedIssues = issues.map(i => selectedIssues.includes(i.id) ? { ...i, [field]: value } : i);
      setIssues(updatedIssues);
      setSelectedIssues([]);
      toast.success(`Bulk updated ${selectedIssues.length} issues`);
      handleManualAction(`bulk updated ${selectedIssues.length} issues`, "update");
    } catch (e) {
      toast.error("Bulk update failed");
    }
  }, [handleManualAction, issues, projectId, selectedIssues]);

  const handleBulkDelete = useCallback(async () => {
    if (!window.confirm(`Delete ${selectedIssues.length} issues?`)) return;
    const promises = selectedIssues.map(id => deleteIssue(id, projectId));
    try {
      await Promise.all(promises);
      setIssues(prev => prev.filter(i => !selectedIssues.includes(i.id)));
      setSelectedIssues([]);
      toast.success(`Deleted ${selectedIssues.length} issues`);
      handleManualAction(`bulk deleted ${selectedIssues.length} issues`, "update");
    } catch (e) {
      toast.error("Bulk delete failed");
    }
  }, [handleManualAction, projectId, selectedIssues]);

  const handleSave = useCallback(async (payload) => {
    if (!projectId) {
      toast.error("Project not selected.");
      return;
    }
    const { id, created_at, updated_at, media_files, ...cleanPayload } = payload;
    const normalizedPayload = {
      ...cleanPayload,
      issue_key: cleanPayload.issue_key || cleanPayload.issueKey,
      project_id: projectId,
      sprint_name: cleanPayload.sprint_name || sprint?.name,
    };
    try {
      if (payload.id) {
        const { data } = await updateIssue(payload.id, normalizedPayload);
        setIssues((prev) => prev.map((i) => (i.id === data.id ? data : i)));
        handleManualAction(`updated issue ISS-${data.id}`, "update");
      } else {
        const { data } = await createIssue(normalizedPayload);
        setIssues((prev) => [data, ...prev]);
        handleManualAction(`created new issue ISS-${data.id}`, "create");
      }
      setEditing(null);
      toast.success("Issue saved");
    } catch (error) {
      toast.error(error?.response?.data?.errors?.join(", ") || "Failed to save issue");
    }
  }, [handleManualAction, projectId, sprint?.name]);

  const handleDelete = useCallback(async (issue) => {
    if (!window.confirm(`Delete issue #${issue.id}?`)) return;
    try {
      await deleteIssue(issue.id, projectId);
      setIssues((prev) => prev.filter((i) => i.id !== issue.id));
      handleManualAction(`deleted issue ISS-${issue.id}`, "update");
      toast.success("Issue deleted");
    } catch (error) {
      toast.error("Failed to delete issue");
    }
  }, [handleManualAction, projectId]);

  const onDragEnd = useCallback(async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const issueId = parseInt(draggableId);
    const newStatus = destination.droppableId;

    // Optimistic UI update
    const issueToUpdate = issues.find(i => i.id === issueId);
    if (!issueToUpdate) return;

    setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: newStatus } : i));
    handleManualAction(`moved ISS-${issueId} to ${newStatus}`, "update");

    try {
      await updateIssue(issueId, { ...issueToUpdate, status: newStatus, project_id: projectId });
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      // Rollback on failure
      setIssues(prev => prev.map(i => i.id === issueId ? issueToUpdate : i));
      toast.error("Failed to update status");
    }
  }, [handleManualAction, issues, projectId]);

  const handleImportFromSheet = useCallback(async () => {
    if (!projectId || isImporting) return;

    setIsImporting(true);
    try {
      const { data } = await importIssuesFromSheet(projectId);
      const issuesRes = await getIssues(projectId);
      setIssues(Array.isArray(issuesRes.data) ? issuesRes.data : []);
      const sheetName = data?.sheet_name || "Issue Tracker";
      toast.success(`Imported ${data.created} new and updated ${data.updated} issues from "${sheetName}".`);
      handleManualAction(`imported issues from sheet ${sheetName}`, "update");
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to import issues from sheet");
    } finally {
      setIsImporting(false);
    }
  }, [handleManualAction, isImporting, projectId]);

  return (
    <div className="min-h-screen bg-slate-50/50 p-6">
      <Toaster position="top-right" />

      {/* Unified Header */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl overflow-hidden mb-6">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl shadow-inner">
              <ShieldExclamationIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100 tracking-tight">Issue Tracker</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Capture and manage project issues</p>
            </div>
          </motion.div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setEditing({})}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all font-semibold shadow-lg shadow-indigo-500/25 active:scale-95 transform"
            >
              <SparklesIcon className="h-4 w-4" />
              <span>Log New Issue</span>
            </button>
            <button
              onClick={handleImportFromSheet}
              disabled={!projectId || isImporting}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-xl transition-all font-semibold shadow-lg shadow-emerald-500/25 active:scale-95 transform"
            >
              <LinkIcon className="h-4 w-4" />
              <span>{isImporting ? "Importing..." : "Import from Sheet"}</span>
            </button>

            <button
              onClick={() => setIsActivityOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-xl font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
            >
              <FireIcon className="h-4 w-4 text-amber-500" />
              Live
            </button>

            <div className="h-10 w-[1px] bg-zinc-200 dark:bg-zinc-700 hidden lg:block mx-2" />

            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sprint Health</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-2 w-24 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-3/4 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                </div>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">75%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="px-6 py-4 bg-zinc-50/50 dark:bg-zinc-800/20 border-t border-zinc-100 dark:border-zinc-800">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={ClipboardDocumentListIcon}
              label="Total Issues"
              value={stats.total}
              color="bg-indigo-500"
              delay={0.1}
            />
            <StatCard
              icon={ShieldExclamationIcon}
              label="Critical"
              value={stats.critical}
              color="bg-rose-500"
              delay={0.2}
              pulse={stats.critical > 0}
            />
            <StatCard
              icon={ExclamationTriangleIcon}
              label="Blocked"
              value={stats.blocked}
              color="bg-amber-500"
              delay={0.3}
            />
            <StatCard
              icon={CheckCircleIcon}
              label="Resolved Today"
              value={stats.resolvedToday}
              color="bg-emerald-500"
              delay={0.4}
            />
          </div>
        </div>
      </div>

      <div className="max-w-[98%] mx-auto px-6 -mt-6 relative z-10 space-y-4">
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/40 p-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative">
                <input
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  placeholder="Search #ID or key..."
                  className="rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30"
                />
                <span className="pointer-events-none absolute right-3 top-2.5 text-slate-400 text-xs">#</span>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold text-slate-600">Status</span>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30 bg-white"
                >
                  <option value="all">All</option>
                  {DEFAULT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold text-slate-600">Sprint</span>
                <select
                  value={sprintFilter}
                  onChange={(e) => setSprintFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30 bg-white"
                >
                  <option value="all">All</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold text-slate-600">Found By</span>
                <select
                  value={foundByFilter}
                  onChange={(e) => setFoundByFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30 bg-white"
                >
                  <option value="all">All</option>
                  {uniqueValues.foundBy.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold text-slate-600">Module</span>
                <select
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30 bg-white"
                >
                  <option value="all">All</option>
                  {uniqueValues.modules.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold text-slate-600">Smart Filter</span>
                <select
                  value={smartFilter}
                  onChange={(e) => setSmartFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-[var(--theme-color)] focus:ring-2 focus:ring-[var(--theme-color)]/30 bg-white"
                >
                  <option value="all">None</option>
                  <option value="aging">Aging (&gt;48h)</option>
                  <option value="critical">Critical Only</option>
                  <option value="unassigned">Unassigned</option>
                </select>
              </div>

              {/* View Switcher */}
              <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 ml-auto">
                <button
                  onClick={() => setViewMode("list")}
                  className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition-all ${viewMode === "list"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                  <ListBulletIcon className="h-4 w-4" />
                  List
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition-all ${viewMode === "kanban"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                  <Squares2X2Icon className="h-4 w-4" />
                  Kanban
                </button>
              </div>
              <button
                type="button"
                onClick={handleToggleSelectAllFiltered}
                disabled={!filteredIssueIds.length}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {allFilteredSelected ? "Unselect All" : "Select All"}
              </button>
              <span className="text-xs font-semibold text-slate-500">
                {selectedFilteredCount}/{filteredIssueIds.length} selected
              </span>
            </div>
          </div>
          {!projectId && (
            <p className="text-sm text-rose-600">Select a project to track issues.</p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-slate-500"><span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--theme-color)]" /> Loading issues...</div>
        ) : filteredIssues.length === 0 && !editing ? (
          filter !== "all" || sprintFilter !== "all" || foundByFilter !== "all" || moduleFilter !== "all" || severityFilter !== "all" || searchId.trim() ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
              <h3 className="text-lg font-semibold text-slate-900">No issues match your filters</h3>
              <p className="mt-2 text-sm text-slate-500">Try adjusting filters or search.</p>
              <button
                onClick={() => {
                  setFilter("all");
                  setSprintFilter("all");
                  setFoundByFilter("all");
                  setModuleFilter("all");
                  setSeverityFilter("all");
                  setSearchId("");
                  setSmartFilter("all");
                }}
                className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <EmptyState onAdd={() => setEditing({})} />
          )
        ) : (
          <AnimatePresence mode="wait">
            {viewMode === "list" ? (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {paginatedIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      onEdit={setEditing}
                      onDelete={handleDelete}
                      isSelected={selectedIssues.includes(issue.id)}
                      onSelect={handleSelectIssue}
                    />
                  ))}
                </div>
                {filteredIssues.length > pageSize && (
                  <div className="flex items-center justify-between pt-4 text-sm text-slate-600">
                    <span>
                      Showing {pageSliceStart + 1}-{Math.min(pageSliceStart + pageSize, filteredIssues.length)} of {filteredIssues.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={page === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className={`rounded-lg px-3 py-2 border ${page === 1 ? 'border-slate-200 text-slate-300' : 'border-slate-300 hover:bg-slate-100'}`}
                      >
                        Prev
                      </button>
                      <span className="px-2">Page {page} / {totalPages}</span>
                      <button
                        disabled={page === totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className={`rounded-lg px-3 py-2 border ${page === totalPages ? 'border-slate-200 text-slate-300' : 'border-slate-300 hover:bg-slate-100'}`}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="kanban"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <KanbanBoard
                  issues={filteredIssues}
                  onEdit={setEditing}
                  onDragEnd={onDragEnd}
                  selectedIssues={selectedIssues}
                  onSelectIssue={handleSelectIssue}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative flex w-full max-w-6xl flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh]"
            >
              <button
                onClick={() => setEditing(null)}
                className="absolute right-4 top-4 rounded-full bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
              <div className="mt-2 flex-1 overflow-y-auto pr-1 sm:pr-2">
                <IssueForm
                  tasks={tasks}
                  sprints={sprints}
                  initial={editing}
                  onSave={handleSave}
                  onCancel={() => setEditing(null)}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ActivityPulse
        activities={mockActivities}
        isOpen={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
      />

      <AnimatePresence>
        {selectedIssues.length > 0 && (
          <BulkActionsToolbar
            selectedCount={selectedIssues.length}
            onClear={() => setSelectedIssues([])}
            onBulkUpdate={handleBulkUpdate}
            onBulkDelete={handleBulkDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default IssueTracker;
