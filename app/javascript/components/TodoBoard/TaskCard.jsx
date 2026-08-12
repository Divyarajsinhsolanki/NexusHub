// src/components/TaskCard.js
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Draggable } from "@hello-pangea/dnd";
import { FiEdit2, FiTrash2, FiCalendar, FiUser, FiTag, FiCheckCircle } from "react-icons/fi";
import { getUsers } from '../api';
import { toast } from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';

const TaskCard = ({ item, index, columnId, onDelete, onUpdate }) => {
  const [, setSearchParams] = useSearchParams();
  const [isEditing, setIsEditing] = useState(false);
  const [editDetails, setEditDetails] = useState({
      title: item.title || '',
      description: item.description || '',
      type: item.type || '',
      status: item.status || 'todo',
      assigned_to_user: item.assigned_to_user || '',
      end_date: item.end_date || ''
  });
  const [users, setUsers] = useState([]);

  const inspectTask = (event) => {
    if (event.target.closest('button, a, input, textarea, select')) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('task_id', item.id);
      next.delete('log_id');
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    if (!isEditing) return;
    getUsers()
      .then(res => setUsers(Array.isArray(res.data) ? res.data : []))
      .catch(() => toast.error('Failed to load users'));
  }, [isEditing]);

  const handleSave = () => {
    const updates = { ...editDetails };
    onUpdate(columnId, item.id, updates);
    setIsEditing(false);
  };

  const renderEditForm = () => (
    <div className="flex flex-col gap-2">
      <input
        value={editDetails.title}
        onChange={(e) => setEditDetails(prev => ({ ...prev, title: e.target.value }))}
        placeholder="Title"
        className="border p-2 rounded"
      />
      <textarea
        value={editDetails.description}
        onChange={(e) => setEditDetails(prev => ({ ...prev, description: e.target.value }))}
        placeholder="Description"
        className="border p-2 rounded"
      />
      <input
        value={editDetails.type}
        onChange={(e) => setEditDetails(prev => ({ ...prev, type: e.target.value }))}
        placeholder="Type"
        className="border p-2 rounded"
        disabled={item.type === 'general'}
      />
      <select
        value={editDetails.status}
        onChange={(e) => setEditDetails(prev => ({ ...prev, status: e.target.value }))}
        className="border p-2 rounded"
      >
        <option value="todo">To Do</option>
        <option value="inprogress">In Progress</option>
        <option value="completed">Completed</option>
      </select>
      <select
        value={editDetails.assigned_to_user}
        onChange={(e) => setEditDetails(prev => ({ ...prev, assigned_to_user: e.target.value }))}
        className="border p-2 rounded"
      >
        <option value="">Unassigned</option>
        {users.map(u => (
          <option key={u.id} value={u.id}>
            {u.first_name ? u.first_name : u.email}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={editDetails.end_date}
        onChange={(e) => setEditDetails(prev => ({ ...prev, end_date: e.target.value }))}
        className="border p-2 rounded"
      />
      <button onClick={handleSave} className="bg-green-500 text-white px-4 py-2 rounded">Save</button>
      <button onClick={() => setIsEditing(false)} className="bg-gray-300 px-4 py-2 rounded">Cancel</button>
    </div>
  );

  const renderTaskDetails = () => (
    <div className="space-y-3">
        <div className="flex justify-between items-start">
            <span className="font-semibold text-lg text-theme transition-colors">
              {item.task_url ? (
                <a href={item.task_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {item.task_id || item.title}
                </a>
              ) : (
                item.task_id || item.title
              )}
            </span>
            <div className="flex items-center gap-2">
                <button onClick={() => setIsEditing(true)} className="text-gray-400 hover:text-theme transition-colors" title="Edit"><FiEdit2 size={18} /></button>
                <button onClick={() => onDelete(columnId, item.id)} className="text-gray-400 hover:text-red-600 transition-colors" title="Delete"><FiTrash2 size={18} /></button>
            </div>
        </div>
        <p className="text-gray-600 text-sm">{item.description || item.title || 'No Description'}</p>

        {item.tags && item.tags.length > 0 && (
            <div className="flex items-center text-sm text-gray-500 mt-2">
                <FiTag className="mr-2" />
                <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag, tagIndex) => (
                        <span key={tagIndex} className="bg-theme/10 text-theme text-xs font-medium px-2.5 py-0.5 rounded-full">
                            {tag}
                        </span>
                    ))}
                </div>
            </div>
        )}

        <div className="border-t border-gray-200 mt-3 pt-3">
            <div className="flex justify-between items-center text-sm text-gray-500">
                <div className="flex items-center">
                    <FiCalendar className="mr-2" />
                    <span>End Date: {item.end_date || "Not set"}</span>
                </div>
                <div className="flex items-center">
                    <FiUser className="mr-2" />
                    <span>{item.assigned_user ? item.assigned_user.first_name || item.assigned_user.email : 'Unassigned'}</span>
                </div>
            </div>
        </div>
    </div>
  );

  return (
    <Draggable key={String(item.id)} draggableId={String(item.id)} index={index}>
      {(provided, snapshot) => {
        const card = (
          <div
            onClick={inspectTask}
            className={`bg-white p-4 mb-4 rounded-lg shadow-md border-l-4 ${
              {
                todo: 'border-theme',
                inprogress: 'border-yellow-500',
                completed: 'border-green-500'
              }[columnId]
            } hover:shadow-xl transition-shadow ${snapshot.isDragging ? 'ring-2 ring-theme shadow-2xl' : ''}`}
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            style={{
              ...provided.draggableProps.style,
              zIndex: snapshot.isDragging ? 9999 : provided.draggableProps.style?.zIndex,
              pointerEvents: snapshot.isDragging ? 'none' : provided.draggableProps.style?.pointerEvents,
            }}
          >
            {isEditing ? renderEditForm() : renderTaskDetails()}
          </div>
        );

        return snapshot.isDragging ? createPortal(card, document.body) : card;
      }}
    </Draggable>
  );
};

export default TaskCard;
