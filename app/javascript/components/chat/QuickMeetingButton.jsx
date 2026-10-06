import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createMeeting } from '../api';

export default function QuickMeetingButton() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await createMeeting('video');
      navigate(`/meet/${data.call_session.public_id}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to create meeting.');
    } finally { setBusy(false); }
  };
  return <button type="button" onClick={start} disabled={busy} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Video size={17} />{busy ? 'Creating...' : 'Quick meeting'}</button>;
}
