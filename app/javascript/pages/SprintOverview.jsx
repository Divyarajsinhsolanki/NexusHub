import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SchedulerAPI, getUsers, fetchProjects } from '../components/api';
import { toast } from 'react-hot-toast';
import SpinnerOverlay from '../components/ui/SpinnerOverlay';
import { FiX } from 'react-icons/fi';
import { CalendarDaysIcon, FunnelIcon, PlusCircleIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { getAvatarInitial } from '/utils/avatar';
import { groupTasksByAssignment } from '../utils/sprintViewUtils';


const FILTER_ORB_PALETTES = [
    { accent: '#2563eb', soft: '#dbeafe', deep: '#1e3a8a' },
    { accent: '#0f766e', soft: '#ccfbf1', deep: '#134e4a' },
    { accent: '#7c3aed', soft: '#ede9fe', deep: '#4c1d95' },
    { accent: '#b45309', soft: '#fef3c7', deep: '#78350f' },
    { accent: '#be123c', soft: '#ffe4e6', deep: '#881337' },
    { accent: '#0369a1', soft: '#e0f2fe', deep: '#0c4a6e' },
];

const pickFilterPalette = (user, index) => {
    if (user?.avatar_color && user.avatar_color !== 'null') {
        return { accent: user.avatar_color, soft: '#f8fafc', deep: '#334155' };
    }

    return FILTER_ORB_PALETTES[index % FILTER_ORB_PALETTES.length];
};

const UserFilterOrb = ({ user, index, selected, onToggle }) => {
    const [imageFailed, setImageFailed] = useState(false);
    const palette = pickFilterPalette(user, index);
    const label = user.first_name || user.email || 'User';
    const initial = getAvatarInitial(label);
    const hasValidImage = user.profile_picture && user.profile_picture !== 'null' && !imageFailed;

    useEffect(() => {
        setImageFailed(false);
    }, [user.profile_picture]);

    return (
        <button
            type="button"
            onClick={onToggle}
            className={`group relative isolate h-11 w-11 overflow-hidden rounded-[18px] transition duration-200 [perspective:900px] focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)] focus:ring-offset-2 ${selected ? '-translate-y-0.5' : 'hover:-translate-y-0.5'}`}
            title={`Filter tasks for ${label}`}
            aria-label={`Filter tasks for ${label}`}
            aria-pressed={selected}
        >
            <span
                className={`absolute inset-x-1.5 bottom-0.5 h-2.5 rounded-full blur-md transition-opacity ${selected ? 'opacity-60' : 'opacity-20 group-hover:opacity-35'}`}
                style={{ backgroundColor: palette.accent }}
            />
            <span
                className={`absolute inset-0 rounded-[18px] border transition duration-200 ${selected ? 'border-white/95 ring-2 ring-[var(--theme-color)] ring-offset-2' : 'border-white/75 group-hover:border-white/95'}`}
                style={{
                    background: `linear-gradient(160deg, rgba(255,255,255,0.98) 0%, ${palette.soft} 55%, rgba(226,232,240,0.96) 100%)`,
                    boxShadow: selected
                        ? `0 16px 28px rgba(15,23,42,0.16), 0 0 0 1px ${palette.accent}26, inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -12px 16px rgba(15,23,42,0.08)`
                        : `0 12px 22px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -12px 14px rgba(15,23,42,0.06)`
                }}
            >
            </span>
            <span className="absolute inset-x-2 top-1.5 h-3 rounded-full bg-white/70 blur-[5px]" />
            <span
                className={`relative flex h-full w-full items-center justify-center transition duration-200 [transform-style:preserve-3d] ${selected ? '[transform:rotateX(8deg)_rotateY(-8deg)]' : 'group-hover:[transform:rotateX(8deg)_rotateY(-8deg)]'}`}
            >
                <span
                    className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-[14px] border border-white/85 shadow-[0_8px_16px_rgba(15,23,42,0.14)]"
                    style={{
                        background: `linear-gradient(145deg, rgba(255,255,255,0.35), ${palette.accent}22 100%)`,
                        transform: 'translateZ(18px)',
                    }}
                >
                    {hasValidImage ? (
                        <img src={user.profile_picture} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setImageFailed(true)} />
                    ) : (
                        <span className="text-sm font-semibold text-slate-800 drop-shadow-[0_1px_0_rgba(255,255,255,0.75)]">{initial}</span>
                    )}
                </span>
                <span
                    className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-white/90"
                    style={{
                        backgroundColor: selected ? palette.accent : '#d6e0ee',
                        boxShadow: selected ? `0 0 0 3px ${palette.accent}18` : 'none',
                    }}
                />
            </span>
        </button>
    );
};

const mapTask = (t) => ({
    id: t.task_id,
    dbId: t.id,
    type: t.type,
    sprintId: t.sprint_id,
    title: t.title || 'title not added',
    description: t.description || '',
    link: t.task_url,
    estimatedHours: t.estimated_hours,
    status: t.status === 'completed' ? 'Completed' : t.status === 'inprogress' ? 'In Progress' : 'To Do',
    assignedTo: [t.developer_id].filter(Boolean).map(String),
    assignedUser: t.assigned_to_user,
    order: t.order,
    startDate: t.start_date || t.date,
    endDate: t.end_date || t.due_date || t.date,
    qa_assigned: t.qa_assigned,
    internal_qa: t.internal_qa,
    blocker: !!t.blocker,
    demo: !!t.demo,
    swag_point: t.swag_point,
    story_point: t.story_point,
    dev_hours: t.dev_hours,
    code_review_hours: t.code_review_hours,
    dev_to_qa_hours: t.dev_to_qa_hours,
    qa_hours: t.qa_hours,
    automation_qa_hours: t.automation_qa_hours,
    total_hours: t.total_hours,
    priority: t.priority,
});

const getTaskTypeParam = (viewMode) => (
    viewMode === 'qa' ? 'qa' : viewMode === 'dev' ? 'Code' : null
);

const isStructuredTask = (task) => ['Code', 'qa'].includes(task?.type);

const selectEstimatedHours = (taskType, taskLike) => {
    const preferredHours = taskType === 'qa' ? taskLike.qa_hours : taskLike.dev_hours;
    if (preferredHours !== null && preferredHours !== undefined && preferredHours !== '') {
        return preferredHours;
    }

    return taskLike.estimatedHours ?? taskLike.estimated_hours ?? '';
};

const formatHours = (hours) => {
    if (hours === null || hours === undefined || hours === '') {
        return '';
    }

    const numericHours = Number(hours);

    if (Number.isNaN(numericHours)) {
        return `${hours}h`;
    }

    const normalizedHours = numericHours.toFixed(2).replace(/\.0+$/, '').replace(/\.(\d*?)0+$/, '.$1');

    return `${normalizedHours}h`;
};

const getDragCloneContainer = () => document.body;

const draggableRowStyle = (style, isDragging) => ({
    ...style,
    zIndex: isDragging ? 9999 : style?.zIndex,
    pointerEvents: isDragging ? 'none' : style?.pointerEvents,
    background: isDragging ? '#ffffff' : style?.background,
    boxShadow: isDragging ? '0 18px 32px -18px rgba(15, 23, 42, 0.45)' : style?.boxShadow,
});

const mapProjectMembersForBoard = (projectMembers = []) => {
    const members = projectMembers.map(member => ({
        id: member.id,
        first_name: member.name,
        email: member.email || member.name,
        profile_picture: member.profile_picture,
        avatar_color: member.avatar_color,
        role: member.role
    }));

    const developerOptions = projectMembers.map(member => ({
        id: member.id,
        name: member.name || member.email,
        avatar_color: member.avatar_color,
        role: member.role
    }));

    return { members, developerOptions };
};

// Task Details Modal Component
const TaskDetailsModal = ({ task, developers, users, sprints, onClose, onUpdate, onDelete }) => {
    const [editedTask, setEditedTask] = useState({ ...task });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setEditedTask(prev => ({ ...prev, [name]: value }));
    };

    const handleDeveloperChange = (e) => {
        const selectedDevId = e.target.value;
        setEditedTask(prev => ({ ...prev, assignedTo: selectedDevId ? [selectedDevId] : [] }));
    };

    const handleUserChange = (e) => {
        setEditedTask(prev => ({ ...prev, assignedUser: e.target.value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onUpdate(editedTask);
    };

    const modalContent = (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="relative bg-white rounded-xl shadow-2xl p-8 w-full max-w-4xl transform transition-all scale-100 opacity-100 overflow-y-auto max-h-[80vh]">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                >
                    <FiX className="w-5 h-5" />
                </button>
                <h2 className="text-3xl font-bold text-[var(--theme-color)] mb-6 text-center">Task Details</h2>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                        <div>
                            <label htmlFor="taskId" className="block text-sm font-medium text-gray-700 mb-1 required-label">
                                Task ID
                            </label>
                            <input
                                type="text"
                                id="taskId"
                                name="id"
                                value={editedTask.id}
                                onChange={handleChange}
                                required
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="taskLink" className="block text-sm font-medium text-gray-700 mb-1">
                                Task Link
                            </label>
                            <input
                                type="url"
                                id="taskLink"
                                name="link"
                                value={editedTask.link}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1 required-label">
                                Status
                            </label>
                            <select
                                id="status"
                                name="status"
                                value={editedTask.status}
                                onChange={handleChange}
                                required
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            >
                                <option value="To Do">To Do</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                            </select>
                        </div>
                        <div className="md:col-span-2 lg:col-span-3">
                            <label htmlFor="taskTitle" className="block text-sm font-medium text-gray-700 mb-1 required-label">
                                Task Title
                            </label>
                            <textarea
                                id="taskTitle"
                                name="title"
                                value={editedTask.title}
                                onChange={handleChange}
                                rows="3"
                                required
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            ></textarea>
                        </div>
                        {/* <div className="md:col-span-2 lg:col-span-3">
                            <label htmlFor="taskDescription" className="block text-sm font-medium text-gray-700 mb-1">
                                Description
                            </label>
                            <textarea
                                id="taskDescription"
                                name="description"
                                value={editedTask.description}
                                onChange={handleChange}
                                rows="2"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            ></textarea>
                        </div> */}
                        <div>
                            <label htmlFor="estimatedHours" className="block text-sm font-medium text-gray-700 mb-1">
                                Estimated Hours
                            </label>
                            <input
                                type="number"
                                id="estimatedHours"
                                name="estimatedHours"
                                value={editedTask.estimatedHours}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="assignedTo" className="block text-sm font-medium text-gray-700 mb-1">
                                Assigned To Developer/QA
                            </label>
                            <select
                                id="assignedTo"
                                name="assignedTo"
                                value={editedTask.assignedTo?.[0] || ''}
                                onChange={handleDeveloperChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            >
                                <option value="">Leave blank for QA task</option>
                                {developers.map(dev => (
                                    <option key={dev.id} value={dev.id}>
                                        {dev.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="assignedUser" className="block text-sm font-medium text-gray-700 mb-1">
                                Assigned User
                            </label>
                            <select
                                id="assignedUser"
                                name="assignedUser"
                                value={editedTask.assignedUser || ''}
                                onChange={handleUserChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            >
                                <option value="">Select user</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.first_name ? `${u.first_name}` : u.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="sprintId" className="block text-sm font-medium text-gray-700 mb-1">
                                Sprint
                            </label>
                            <select
                                id="sprintId"
                                name="sprintId"
                                value={editedTask.sprintId || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            >
                                <option value="">Unassigned</option>
                                {sprints.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                                Start Date
                            </label>
                            <input
                                type="date"
                                id="startDate"
                                name="startDate"
                                value={editedTask.startDate}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                                End Date
                            </label>
                            <input
                                type="date"
                                id="endDate"
                                name="endDate"
                                value={editedTask.endDate}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="order" className="block text-sm font-medium text-gray-700 mb-1">
                                Order
                            </label>
                            <input
                                type="number"
                                id="order"
                                name="order"
                                value={editedTask.order}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">QA Assigned</label>
                            <input
                                name="qa_assigned"
                                value={editedTask.qa_assigned || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Internal QA</label>
                            <input
                                name="internal_qa"
                                value={editedTask.internal_qa || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div className="flex items-center gap-3 mt-6">
                            <label className="text-sm font-medium text-gray-700">Blocker?</label>
                            <input
                                type="checkbox"
                                name="blocker"
                                checked={!!editedTask.blocker}
                                onChange={(e) => setEditedTask(prev => ({ ...prev, blocker: e.target.checked }))}
                                className="h-5 w-5 text-[var(--theme-color)] rounded border-gray-300 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div className="flex items-center gap-3 mt-6">
                            <label className="text-sm font-medium text-gray-700">Demo</label>
                            <input
                                type="checkbox"
                                name="demo"
                                checked={!!editedTask.demo}
                                onChange={(e) => setEditedTask(prev => ({ ...prev, demo: e.target.checked }))}
                                className="h-5 w-5 text-[var(--theme-color)] rounded border-gray-300 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                            <input
                                name="priority"
                                value={editedTask.priority || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Story Point</label>
                            <input
                                type="number"
                                step="0.1"
                                name="story_point"
                                value={editedTask.story_point || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Swag Point</label>
                            <input
                                type="number"
                                step="0.1"
                                name="swag_point"
                                value={editedTask.swag_point || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Dev</label>
                            <input
                                type="number"
                                step="0.1"
                                name="dev_hours"
                                value={editedTask.dev_hours || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Code Review</label>
                            <input
                                type="number"
                                step="0.1"
                                name="code_review_hours"
                                value={editedTask.code_review_hours || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Dev → QA</label>
                            <input
                                type="number"
                                step="0.1"
                                name="dev_to_qa_hours"
                                value={editedTask.dev_to_qa_hours || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">QA</label>
                            <input
                                type="number"
                                step="0.1"
                                name="qa_hours"
                                value={editedTask.qa_hours || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Automation QA</label>
                            <input
                                type="number"
                                step="0.1"
                                name="automation_qa_hours"
                                value={editedTask.automation_qa_hours || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
                            <input
                                type="number"
                                step="0.1"
                                name="total_hours"
                                value={editedTask.total_hours || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <button
                            type="button"
                            onClick={() => onDelete(task.dbId)}
                            className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition duration-200 ease-in-out shadow-md"
                        >
                            Delete Task
                        </button>
                        <div className="space-x-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition duration-200 ease-in-out shadow-md"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-3 bg-[var(--theme-color)] text-white rounded-lg font-semibold hover:brightness-110 transition duration-200 ease-in-out shadow-md"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

// Add Task Modal Component
const AddTaskModal = ({ developers, users, onClose, onCreate, projectId, viewMode }) => {
    const [newTask, setNewTask] = useState({
        task_id: '',
        task_url: '',
        status: 'todo',
        title: '',
        description: '',
        estimated_hours: '',
        developer_id: viewMode === 'dev' ? (developers[0]?.id || '') : '',
        assigned_to_user: '',
        start_date: '',
        end_date: '',
        order: '',
        project_id: projectId || '',
        qa_assigned: '',
        internal_qa: '',
        blocker: false,
        demo: false,
        swag_point: '',
        story_point: '',
        dev_hours: '',
        code_review_hours: '',
        dev_to_qa_hours: '',
        qa_hours: '',
        automation_qa_hours: '',
        total_hours: '',
        priority: ''
    });

    useEffect(() => {
        setNewTask(t => ({ ...t, developer_id: viewMode === 'dev' ? (developers[0]?.id || '') : '' }));
    }, [developers, viewMode]);

    useEffect(() => {
        setNewTask(t => ({ ...t, project_id: projectId || '' }));
    }, [projectId]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setNewTask(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onCreate(newTask);
    };

    const modalContent = (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="relative bg-white rounded-xl shadow-2xl p-8 w-full max-w-4xl transform transition-all scale-100 opacity-100 overflow-y-auto max-h-[80vh]">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                >
                    <FiX className="w-5 h-5" />
                </button>
                <h2 className="text-3xl font-bold text-[var(--theme-color)] mb-6 text-center">Add Task</h2>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                        <div>
                            <label htmlFor="task_id" className="block text-sm font-medium text-gray-700 mb-1 required-label">
                                Task ID
                            </label>
                            <input
                                type="text"
                                id="task_id"
                                name="task_id"
                                value={newTask.task_id}
                                onChange={handleChange}
                                required
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="task_url" className="block text-sm font-medium text-gray-700 mb-1">
                                Task Link
                            </label>
                            <input
                                type="url"
                                id="task_url"
                                name="task_url"
                                value={newTask.task_url}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1 required-label">
                                Status
                            </label>
                            <select
                                id="status"
                                name="status"
                                value={newTask.status}
                                onChange={handleChange}
                                required
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            >
                                <option value="todo">To Do</option>
                                <option value="inprogress">In Progress</option>
                                <option value="completed">Completed</option>
                            </select>
                        </div>
                        <div className="md:col-span-2 lg:col-span-3">
                            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1 required-label">
                                Task Title
                            </label>
                            <textarea
                                id="title"
                                name="title"
                                value={newTask.title}
                                onChange={handleChange}
                                rows="3"
                                required
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            ></textarea>
                        </div>
                        {/* <div className="md:col-span-2 lg:col-span-3">
                            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                                Description
                            </label>
                            <textarea
                                id="description"
                                name="description"
                                value={newTask.description}
                                onChange={handleChange}
                                rows="2"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            ></textarea>
                        </div> */}
                        <div>
                            <label htmlFor="estimated_hours" className="block text-sm font-medium text-gray-700 mb-1">
                                Estimated Hours
                            </label>
                            <input
                                type="number"
                                id="estimated_hours"
                                name="estimated_hours"
                                value={newTask.estimated_hours}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="developer_id" className="block text-sm font-medium text-gray-700 mb-1">
                                Assigned To Developer/QA
                            </label>
                            <select
                                id="developer_id"
                                name="developer_id"
                                value={newTask.developer_id}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            >
                                <option value="">Leave blank for QA task</option>
                                {developers.map(dev => (
                                    <option key={dev.id} value={dev.id}>
                                        {dev.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="assigned_to_user" className="block text-sm font-medium text-gray-700 mb-1">
                                Assigned User
                            </label>
                            <select
                                id="assigned_to_user"
                                name="assigned_to_user"
                                value={newTask.assigned_to_user}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            >
                                <option value="">Select user</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.first_name ? `${u.first_name}` : u.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="start_date" className="block text-sm font-medium text-gray-700 mb-1">
                                Start Date
                            </label>
                            <input
                                type="date"
                                id="start_date"
                                name="start_date"
                                value={newTask.start_date}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="end_date" className="block text-sm font-medium text-gray-700 mb-1">
                                End Date
                            </label>
                            <input
                                type="date"
                                id="end_date"
                                name="end_date"
                                value={newTask.end_date}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="order" className="block text-sm font-medium text-gray-700 mb-1">
                                Order
                            </label>
                            <input
                                type="number"
                                id="order"
                                name="order"
                                value={newTask.order}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="qa_assigned" className="block text-sm font-medium text-gray-700 mb-1">
                                QA Assigned
                            </label>
                            <input
                                id="qa_assigned"
                                name="qa_assigned"
                                value={newTask.qa_assigned}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="internal_qa" className="block text-sm font-medium text-gray-700 mb-1">
                                Internal QA
                            </label>
                            <input
                                id="internal_qa"
                                name="internal_qa"
                                value={newTask.internal_qa}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <label htmlFor="blocker" className="block text-sm font-medium text-gray-700">
                                Blocker?
                            </label>
                            <input
                                type="checkbox"
                                id="blocker"
                                name="blocker"
                                checked={newTask.blocker}
                                onChange={handleChange}
                                className="h-5 w-5 text-[var(--theme-color)] rounded border-gray-300 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <label htmlFor="demo" className="block text-sm font-medium text-gray-700">
                                Demo
                            </label>
                            <input
                                type="checkbox"
                                id="demo"
                                name="demo"
                                checked={newTask.demo}
                                onChange={handleChange}
                                className="h-5 w-5 text-[var(--theme-color)] rounded border-gray-300 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
                                Priority
                            </label>
                            <input
                                id="priority"
                                name="priority"
                                value={newTask.priority}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Story Point</label>
                            <input
                                type="number"
                                step="0.1"
                                name="story_point"
                                value={newTask.story_point}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Swag Point</label>
                            <input
                                type="number"
                                step="0.1"
                                name="swag_point"
                                value={newTask.swag_point}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Dev</label>
                            <input
                                type="number"
                                step="0.1"
                                name="dev_hours"
                                value={newTask.dev_hours}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Code Review</label>
                            <input
                                type="number"
                                step="0.1"
                                name="code_review_hours"
                                value={newTask.code_review_hours}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Dev → QA</label>
                            <input
                                type="number"
                                step="0.1"
                                name="dev_to_qa_hours"
                                value={newTask.dev_to_qa_hours}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">QA</label>
                            <input
                                type="number"
                                step="0.1"
                                name="qa_hours"
                                value={newTask.qa_hours}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Automation QA</label>
                            <input
                                type="number"
                                step="0.1"
                                name="automation_qa_hours"
                                value={newTask.automation_qa_hours}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
                            <input
                                type="number"
                                step="0.1"
                                name="total_hours"
                                value={newTask.total_hours}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end space-x-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition duration-200 ease-in-out shadow-md"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-3 bg-[var(--theme-color)] text-white rounded-lg font-semibold hover:brightness-110 transition duration-200 ease-in-out shadow-md"
                        >
                            Create Task
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

// Main Component
const SprintOverview = ({ sprintId, onSprintChange, projectId, sheetIntegrationEnabled, projectMembers, viewMode = 'combined' }) => {
    const [sprints, setSprints] = useState([]);
    const [developers, setDevelopers] = useState([]);
    const [users, setUsers] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [backlogTasks, setBacklogTasks] = useState([]);
    const [selectedSprintId, setSelectedSprintId] = useState(sprintId || null);
    const [filterUsers, setFilterUsers] = useState([]);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        // keep local state in sync with sprintId prop
        if (sprintId) {
            setSelectedSprintId(sprintId);
        } else {
            setSelectedSprintId(null);
        }
    }, [sprintId]);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [currentTask, setCurrentTask] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingBacklog, setEditingBacklog] = useState(false);
    const [addingToBacklog, setAddingToBacklog] = useState(false);
    const taskTypeParam = getTaskTypeParam(viewMode);

    const toggleUserFilter = (id) => {
        setFilterUsers(prev =>
            prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
        );
    };

    const clearUserFilters = () => setFilterUsers([]);

    const getTaskAssignmentLabel = (task) => {
        if (task.assignedTo?.length) {
            return task.assignedTo
                .map(id => developers.find(dev => String(dev.id) === String(id))?.name || 'Unknown')
                .join(', ');
        }

        return task.qa_assigned || '-';
    };

    const buildTaskPayload = (taskLike, { backlog = false } = {}) => {
        const developerId = Number(taskLike.developer_id ?? taskLike.assignedTo?.[0]) || null;
        const qaAssigned = (taskLike.qa_assigned || '').trim();
        const fallbackTaskType = taskLike.type === 'qa' ? 'qa' : (viewMode === 'qa' ? 'qa' : 'Code');
        const taskType = developerId ? 'Code' : qaAssigned ? 'qa' : fallbackTaskType;

        return {
            task_id: taskLike.task_id || taskLike.id,
            task_url: taskLike.task_url || taskLike.link,
            type: taskType,
            sprint_id: backlog ? null : (taskLike.sprintId ? Number(taskLike.sprintId) : selectedSprintId),
            title: taskLike.title,
            description: taskLike.description,
            start_date: taskLike.start_date || taskLike.startDate,
            end_date: taskLike.end_date || taskLike.endDate,
            estimated_hours: selectEstimatedHours(taskType, taskLike),
            developer_id: developerId,
            assigned_to_user: taskLike.assigned_to_user || taskLike.assignedUser || null,
            status: (taskLike.status?.toLowerCase().replace(' ', '')) || 'todo',
            order: taskLike.order,
            project_id: Number(taskLike.project_id || projectId) || null,
            qa_assigned: qaAssigned,
            internal_qa: taskLike.internal_qa,
            blocker: !!taskLike.blocker,
            demo: !!taskLike.demo,
            swag_point: taskLike.swag_point,
            story_point: taskLike.story_point,
            dev_hours: taskLike.dev_hours,
            code_review_hours: taskLike.code_review_hours,
            dev_to_qa_hours: taskLike.dev_to_qa_hours,
            qa_hours: taskLike.qa_hours,
            automation_qa_hours: taskLike.automation_qa_hours,
            total_hours: taskLike.total_hours,
            priority: taskLike.priority
        };
    };

    useEffect(() => {
        if (projectId && Array.isArray(projectMembers)) {
            const { members, developerOptions } = mapProjectMembersForBoard(projectMembers);
            setUsers(members);
            setDevelopers(developerOptions);
        } else if (projectId) {
            fetchProjects().then(({ data }) => {
                const list = Array.isArray(data) ? data : [];
                const project = list.find(p => p.id === Number(projectId));
                const { members, developerOptions } = mapProjectMembersForBoard(project ? project.users : []);
                setUsers(members);
                setDevelopers(developerOptions);
            });
        } else {
            SchedulerAPI.getDevelopers().then(res => setDevelopers(res.data));
            getUsers().then(res => setUsers(Array.isArray(res.data) ? res.data : []));
        }
        const query = projectId ? `?project_id=${projectId}` : '';
        fetch(`/api/sprints.json${query}`)
            .then(res => res.json())
            .then(data => {
                const list = Array.isArray(data) ? data : [];
                setSprints(list);
                if (list.length) {
                    const today = new Date();
                    const current = list.find(s => {
                        const start = new Date(s.start_date);
                        const end = new Date(s.end_date);
                        return today >= start && today <= end;
                    }) || list[0];
                    setSelectedSprintId(prev => {
                        if (prev !== null) return prev;
                        if (onSprintChange) onSprintChange(current.id);
                        return current.id;
                    });
                } else {
                    setSelectedSprintId(null);
                    if (onSprintChange) onSprintChange(null);
                }
            });
    }, [projectId, sprintId, projectMembers]);

    useEffect(() => {
        if (!sprintId && onSprintChange && selectedSprintId !== null) {
            onSprintChange(selectedSprintId);
        }
    }, [selectedSprintId, sprintId, onSprintChange]);

    useEffect(() => {
        if (selectedSprintId === null) {
            setTasks([]);
            return;
        }
        const params = { sprint_id: selectedSprintId, project_id: projectId };
        if (taskTypeParam) params.type = taskTypeParam;
        SchedulerAPI.getTasks(params).then(res => {
            const mapped = res.data.filter(isStructuredTask).map(mapTask);
            setTasks(mapped);
        });
    }, [selectedSprintId, projectId, taskTypeParam]);

    useEffect(() => {
        const params = projectId ? { project_id: projectId } : {};
        if (taskTypeParam) params.type = taskTypeParam;
        SchedulerAPI.getTasks(params).then(res => {
            const mapped = res.data.filter(t => !t.sprint_id && isStructuredTask(t)).map(mapTask);
            setBacklogTasks(mapped);
        });
    }, [projectId, taskTypeParam]);

    const filteredTasks = tasks.filter(task => {
        if (task.sprintId !== selectedSprintId) return false;
        if (filterUsers.length && !filterUsers.includes(String(task.assignedUser))) return false;
        return true;
    });

    const developerMap = useMemo(() => developers.reduce((acc, developer) => {
        acc[String(developer.id)] = developer;
        return acc;
    }, {}), [developers]);

    const filteredBacklogTasks = backlogTasks.filter(task => {
        if (filterUsers.length && !filterUsers.includes(String(task.assignedUser))) return false;
        return true;
    });

    const groupedTasks = useMemo(
        () => groupTasksByAssignment(filteredTasks, developerMap),
        [filteredTasks, developerMap]
    );

    const groupedBacklog = useMemo(
        () => groupTasksByAssignment(filteredBacklogTasks, developerMap),
        [filteredBacklogTasks, developerMap]
    );

    const getUserName = (userId) => {
        const user = users.find(u => String(u.id) === String(userId));
        if (!user) return 'Unknown';
        return user.first_name ? `${user.first_name}` : user.email;
    };

    const currentSprint = sprints.find(s => s.id === selectedSprintId);

    const renderGroupHeader = (group) => (
        <tr className={group.type === 'qa' ? 'bg-purple-50' : 'bg-gray-100'}>
            <td colSpan="9" className="px-6 py-2 font-semibold text-gray-700">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${group.type === 'qa'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-slate-200 text-slate-700'
                    }`}>
                    {group.type === 'qa' ? 'QA' : 'Dev'}
                </span>
                <span className="ml-2">{group.label}</span>
                <span className="ml-2 text-sm font-normal text-gray-500">Total Est. Hours: {formatHours(group.totalHours)}</span>
            </td>
        </tr>
    );

    const renderTaskCells = (task) => (
        <>
            <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                {task.order}
            </td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-indigo-600 hover:underline">
                <a href={task.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    {task.id}
                </a>
            </td>
            <td className="px-6 py-3 whitespace-normal text-sm text-gray-900">
                {task.title}
            </td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                {formatHours(task.estimatedHours)}
            </td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                {getTaskAssignmentLabel(task)}
            </td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                {getUserName(task.assignedUser)}
            </td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                {task.startDate ? new Date(task.startDate).getDate() : '-'}
            </td>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                {task.endDate ? new Date(task.endDate).getDate() : '-'}
            </td>
            <td className="px-6 py-3 whitespace-nowrap text-sm">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                    ${task.status === 'Completed' ? 'bg-green-100 text-green-800' : ''}
                    ${task.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' : ''}
                    ${task.status === 'To Do' ? 'bg-[rgb(var(--theme-color-rgb)/0.1)] text-[var(--theme-color)]' : ''}
                `}>
                    {task.status}
                </span>
            </td>
        </>
    );

    const matchesActiveView = (taskLike) => !taskTypeParam || taskLike.type === taskTypeParam;

    const openTaskModal = (task, backlog = false) => {
        setCurrentTask(task);
        setEditingBacklog(backlog);
        setShowTaskModal(true);
    };

    const onDragEnd = async (result) => {
        if (!result.destination) return;

        const srcDev = result.source.droppableId.replace('dev-', '');
        const dstDev = result.destination.droppableId.replace('dev-', '');

        // Build map of tasks by developer sorted by order so
        // indices from the UI match the underlying arrays
        const map = tasks.reduce((acc, t) => {
            const d = t.assignedTo?.[0] ? String(t.assignedTo[0]) : 'unassigned';
            if (!acc[d]) acc[d] = [];
            acc[d].push({ ...t });
            return acc;
        }, {});
        Object.values(map).forEach(list =>
            list.sort((a, b) => (a.order || 0) - (b.order || 0))
        );

        const previousTasks = tasks;
        const sourceList = map[srcDev] || [];
        const [moved] = sourceList.splice(result.source.index, 1);
        if (!moved) return;

        moved.assignedTo = dstDev === 'unassigned' ? [] : [dstDev];
        const destList = map[dstDev] || (map[dstDev] = []);
        destList.splice(result.destination.index, 0, moved);

        // Reassign orders
        sourceList.forEach((t, i) => { t.order = i + 1; });
        if (srcDev !== dstDev) destList.forEach((t, i) => { t.order = i + 1; });

        const newTasks = Object.values(map).flat();
        setTasks(newTasks);

        // Persist changes for affected tasks
        const updates = srcDev === dstDev ? destList : [...sourceList, ...destList];
        try {
            await Promise.all(updates.map(t => {
                const devId = t.assignedTo?.[0] ? Number(t.assignedTo[0]) : null;
                return SchedulerAPI.updateTask(t.dbId, { developer_id: devId, order: t.order });
            }));
        } catch (error) {
            setTasks(previousTasks);
            toast.error('Failed to reorder tasks');
        }
    };

    const handleUpdateTask = async (updatedTask) => {
        try {
            const payload = {
                ...buildTaskPayload(updatedTask),
                sprint_id: updatedTask.sprintId ? Number(updatedTask.sprintId) : null
            };
            const { data } = await SchedulerAPI.updateTask(updatedTask.dbId, payload);
            const mapped = mapTask(data);
            const shouldDisplay = isStructuredTask(data) && matchesActiveView(data);

            if (payload.sprint_id === null) {
                setTasks(tasks.filter(t => t.dbId !== updatedTask.dbId));
                setBacklogTasks(prev => {
                    const others = prev.filter(t => t.dbId !== updatedTask.dbId);
                    return shouldDisplay ? [...others, mapped] : others;
                });
            } else if (payload.sprint_id === selectedSprintId) {
                setBacklogTasks(prev => prev.filter(t => t.dbId !== updatedTask.dbId));
                setTasks(prev => {
                    const others = prev.filter(t => t.dbId !== updatedTask.dbId);
                    return shouldDisplay ? [...others, mapped] : others;
                });
            } else {
                setTasks(prev => prev.filter(t => t.dbId !== updatedTask.dbId));
                setBacklogTasks(prev => prev.filter(t => t.dbId !== updatedTask.dbId));
            }
        } catch (e) {
            console.error("Failed to update task", e);
        }
        setShowTaskModal(false);
    };

    const handleDeleteTask = async (dbId) => {
        try {
            await SchedulerAPI.deleteTask(dbId);
            if (editingBacklog) {
                setBacklogTasks(backlogTasks.filter(t => t.dbId !== dbId));
            } else {
                setTasks(tasks.filter(t => t.dbId !== dbId));
            }
        } catch (e) {
            console.error('Failed to delete task', e);
        }
        setShowTaskModal(false);
    };
    const handleAddTask = async (newTask) => {
        try {
            const payload = {
                ...buildTaskPayload(newTask, { backlog: addingToBacklog }),
                date: newTask.start_date || new Date().toISOString().slice(0, 10)
            };
            const { data } = await SchedulerAPI.createTask(payload);
            const mapped = mapTask(data);
            if (!isStructuredTask(data) || !matchesActiveView(data)) {
                setShowAddModal(false);
                return;
            }
            if (addingToBacklog) {
                setBacklogTasks([...backlogTasks, mapped]);
            } else {
                setTasks([...tasks, mapped]);
            }
        } catch (e) {
            console.error('Failed to add task', e);
        }
        setShowAddModal(false);
    };

    const handleImport = async () => {
        if (!selectedSprintId) return;
        try {
            setProcessing(true);
            await SchedulerAPI.importSprintTasks(selectedSprintId);
            const params = { sprint_id: selectedSprintId, project_id: projectId };
            if (taskTypeParam) params.type = taskTypeParam;
            const res = await SchedulerAPI.getTasks(params);
            const mapped = res.data.filter(isStructuredTask).map(mapTask);
            setTasks(mapped);
            toast.success('Imported tasks from sheet');
        } catch (e) {
            toast.error('Import failed');
        }
        setProcessing(false);
    };

    const handleBacklogImport = async () => {
        try {
            setProcessing(true);
            await SchedulerAPI.importBacklogTasks(projectId);
            toast.success('Imported backlog from sheet');
            const params = projectId ? { project_id: projectId } : {};
            if (taskTypeParam) params.type = taskTypeParam;
            const res = await SchedulerAPI.getTasks(params);
            const mapped = res.data.filter(t => !t.sprint_id && isStructuredTask(t)).map(mapTask);
            setBacklogTasks(mapped);
        } catch (e) {
            toast.error('Import failed');
        }
        setProcessing(false);
    };

    const handleExport = async () => {
        if (!selectedSprintId) return;
        try {
            setProcessing(true);
            await SchedulerAPI.exportSprintTasks(selectedSprintId);
            toast.success('Exported tasks to sheet');
        } catch (e) {
            toast.error('Export failed');
        }
        setProcessing(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-sky-100 px-4 pb-6 pt-1 font-sans text-gray-800 sm:px-6">
            {processing && <SpinnerOverlay />}
            <div className="mx-auto max-w-[96rem] rounded-[26px] bg-white p-4 shadow-lg sm:p-5">
                <div className="mb-4 space-y-3">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <h1 className="flex items-center text-[1.75rem] font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-color)] to-[var(--theme-color)]">
                            <Squares2X2Icon className="mr-2 h-7 w-7" />Sprint Task Manager
                        </h1>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => { setAddingToBacklog(false); setShowAddModal(true); }}
                                className="flex items-center rounded-lg bg-[var(--theme-color)] px-4 py-2 text-sm font-semibold text-white shadow-md hover:brightness-110"
                            >
                                <PlusCircleIcon className="mr-2 h-5 w-5" />
                                Add Task
                            </button>
                            {sheetIntegrationEnabled && (
                                <>
                                    <button
                                        onClick={handleImport}
                                        className="flex items-center rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-green-700"
                                    >
                                        Import from Sheet
                                    </button>
                                    <button
                                        onClick={handleExport}
                                        className="flex items-center rounded-lg bg-[var(--theme-color)] px-4 py-2 text-sm font-semibold text-white shadow-md hover:brightness-110"
                                    >
                                        Export to Sheet
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div
                        className="flex flex-wrap items-center gap-3 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(240,247,255,0.86))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_14px_28px_rgba(15,23,42,0.06)]"
                        aria-label="Task assignee filters"
                    >
                        <div className="flex items-center gap-3 pr-1 sm:border-r sm:border-slate-200 sm:pr-4">
                            <span className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-slate-900 text-white shadow-[0_10px_18px_rgba(15,23,42,0.18),inset_3px_4px_8px_rgba(255,255,255,0.16)]">
                                <FunnelIcon className="h-[18px] w-[18px]" />
                            </span>
                            <div>
                                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Assignee Filter</p>
                                <p className="text-sm font-semibold text-slate-900">
                                    {filterUsers.length ? `${filterUsers.length} selected` : 'All assignees'}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-1 flex-wrap items-center gap-2">
                            {users.map((u, index) => (
                                <UserFilterOrb
                                    key={u.id}
                                    user={u}
                                    index={index}
                                    selected={filterUsers.includes(String(u.id))}
                                    onToggle={() => toggleUserFilter(String(u.id))}
                                />
                            ))}
                        </div>

                        {filterUsers.length > 0 ? (
                            <button
                                type="button"
                                onClick={clearUserFilters}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.06)] hover:border-slate-300 hover:text-slate-900"
                            >
                                All
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* Tasks Table */}
                <div className="overflow-x-auto bg-white rounded-xl shadow-md">
                    <DragDropContext onDragEnd={onDragEnd}>
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tl-xl">
                                        Order
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Task ID
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Task Title
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Est. Hours
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Assigned To Developer/QA
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Assigned User
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Start Date
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        End Date
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tr-xl">
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            {groupedTasks.length > 0 ? (
                                groupedTasks.map(group => (
                                    group.type === 'dev' ? (
                                        <Droppable
                                            droppableId={`dev-${group.rawValue}`}
                                            key={group.key}
                                            getContainerForClone={getDragCloneContainer}
                                            renderClone={(provided, snapshot, rubric) => {
                                                const task = group.tasks[rubric.source.index];

                                                return (
                                                    <table
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        className="min-w-full border-collapse bg-white text-left shadow-2xl ring-2 ring-[var(--theme-color)]"
                                                        style={draggableRowStyle(provided.draggableProps.style, snapshot.isDragging)}
                                                    >
                                                        <tbody>
                                                            <tr className="bg-white">
                                                                {renderTaskCells(task)}
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                );
                                            }}
                                        >
                                            {(provided) => (
                                                <tbody ref={provided.innerRef} {...provided.droppableProps} className="bg-white divide-y divide-gray-200">
                                                    {renderGroupHeader(group)}
                                                    {group.tasks.map((task, idx) => (
                                                        <Draggable key={task.dbId} draggableId={`task-${task.dbId}`} index={idx}>
                                                            {(prov, snapshot) => (
                                                                <tr
                                                                    ref={prov.innerRef}
                                                                    {...prov.draggableProps}
                                                                    {...prov.dragHandleProps}
                                                                    style={draggableRowStyle(prov.draggableProps.style, snapshot.isDragging)}
                                                                    className={`hover:bg-gray-50 cursor-pointer ${snapshot.isDragging ? 'bg-white ring-2 ring-[var(--theme-color)]' : ''}`}
                                                                    onClick={() => openTaskModal(task)}
                                                                >
                                                                    {renderTaskCells(task)}
                                                                </tr>
                                                            )}
                                                        </Draggable>
                                                    ))}
                                                    {provided.placeholder}
                                                </tbody>
                                            )}
                                        </Droppable>
                                    ) : (
                                        <tbody key={group.key} className="bg-white divide-y divide-gray-200">
                                            {renderGroupHeader(group)}
                                            {group.tasks.map(task => (
                                                <tr key={task.dbId} className="hover:bg-gray-50 cursor-pointer" onClick={() => openTaskModal(task)}>
                                                    {renderTaskCells(task)}
                                                </tr>
                                            ))}
                                        </tbody>
                                    )
                                ))
                            ) : (
                                <tbody>
                                    <tr>
                                        <td colSpan="9" className="px-6 py-3 text-center text-gray-500">
                                            No tasks found for this sprint.
                                        </td>
                                    </tr>
                                </tbody>
                            )}
                        </table>
                    </DragDropContext>
                </div>
            </div>

            {/* Backlog Tasks */}
            <div className="max-w-8xl mx-auto bg-white rounded-xl shadow-lg p-4 mt-8">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--theme-color)] to-[var(--theme-color)] flex items-center">
                        <CalendarDaysIcon className="h-7 w-7 mr-2" />Backlog
                    </h1>
                    <div className="flex space-x-2">
                        <button
                            onClick={() => { setAddingToBacklog(true); setShowAddModal(true); }}
                            className="flex items-center bg-[var(--theme-color)] hover:brightness-110 text-white font-semibold py-2 px-4 rounded-lg shadow-md"
                        >
                            <PlusCircleIcon className="h-5 w-5 mr-2" />
                            Add Task
                        </button>
                        {sheetIntegrationEnabled && (
                            <button
                                onClick={handleBacklogImport}
                                className="flex items-center bg-green-500 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md"
                            >
                                Import Backlog
                            </button>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto bg-white rounded-xl shadow-md">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tl-xl">Order</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task Title</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Est. Hours</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To Developer/QA</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned User</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tr-xl">Status</th>
                            </tr>
                        </thead>
                        {groupedBacklog.length > 0 ? (
                            groupedBacklog.map(group => (
                                <tbody key={group.key} className="bg-white divide-y divide-gray-200">
                                    {renderGroupHeader(group)}
                                    {group.tasks.map(task => (
                                        <tr key={task.dbId} className="hover:bg-gray-50 cursor-pointer" onClick={() => openTaskModal(task, true)}>
                                            {renderTaskCells(task)}
                                        </tr>
                                    ))}
                                </tbody>
                            ))
                        ) : (
                            <tbody>
                                <tr>
                                    <td colSpan="9" className="px-6 py-3 text-center text-gray-500">No backlog tasks found.</td>
                                </tr>
                            </tbody>
                        )}
                    </table>
                </div>
            </div>

            {/* Add Task Modal */}
            {showAddModal && (
                <AddTaskModal
                    developers={developers}
                    users={users}
                    onClose={() => setShowAddModal(false)}
                    onCreate={handleAddTask}
                    projectId={projectId}
                    viewMode={viewMode}
                />
            )}

            {/* Task Details Modal */}
            {showTaskModal && currentTask && (
                <TaskDetailsModal
                    task={currentTask}
                    developers={developers}
                    users={users}
                    sprints={sprints}
                    onClose={() => setShowTaskModal(false)}
                    onUpdate={handleUpdateTask}
                    onDelete={handleDeleteTask}
                />
            )}
        </div>
    );
};

export default SprintOverview;
