import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Phone, Video } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../../context/AuthContext';
import { createCall, joinCall, startDirectConversation } from '../api';

export default function MemberContactActions({ userId, onNavigate }) {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!userId || Number(auth?.user?.id) === Number(userId)) return null;
  const start = async (type) => {
    if (busy) return;
    setBusy(true);
    try {
      const { data: conversation } = await startDirectConversation(userId);
      if (type === 'message') {
        onNavigate?.();
        navigate(`/chat/${conversation.id}`);
      } else {
        const { data } = await createCall(conversation.id, type);
        const { data: joined } = await joinCall(data.call_session.id);
        onNavigate?.();
        navigate(`/meet/${joined.call_session.public_id}`, { state: {
          callSession: joined.call_session,
          credentials: { server_url: joined.server_url, participant_token: joined.participant_token },
        } });
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to connect to this user.');
    } finally { setBusy(false); }
  };
  return <div className="flex shrink-0 items-center gap-1">
    {[["message", "Message", MessageSquare], ["audio", "Voice call", Phone], ["video", "Video call", Video]].map(([type, label, Icon]) => <button key={type} type="button" disabled={busy} title={label} aria-label={label} onClick={(event) => { event.stopPropagation(); start(type); }} className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"><Icon size={17} /></button>)}
  </div>;
}
