import React, { useEffect, useState } from 'react';
import { updateConversation } from '../api';

export default function GroupProfile({ conversation, onUpdated, readOnly = false }) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [allowMembers, setAllowMembers] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setEditing(false); setError(''); }, [conversation.id]);
  if (conversation.conversation_type !== 'group') return null;
  const canEdit = !readOnly && (conversation.can_edit_group_info || conversation.can_edit_group);
  const begin = () => {
    setDescription(conversation.description || '');
    setAllowMembers(Boolean(conversation.members_can_edit_group_info));
    setPhoto(null); setRemovePhoto(false); setError(''); setEditing(true);
  };
  const save = async event => {
    event.preventDefault();
    if (busy) return;
    if (photo && (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024)) {
      setError('Choose a JPEG, PNG, GIF or WebP image, 5 MB or smaller.'); return;
    }
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('conversation[description]', description);
      if (conversation.can_edit_group) form.append('conversation[members_can_edit_group_info]', String(allowMembers));
      if (photo) form.append('conversation[group_photo]', photo);
      if (removePhoto) form.append('conversation[remove_group_photo]', 'true');
      const { data } = await updateConversation(conversation.id, form);
      onUpdated(data); setEditing(false);
    } catch (failure) { setError(failure.response?.data?.errors?.join(', ') || 'Could not update group info. Please try again.'); }
    finally { setBusy(false); }
  };
  return <section className="chat-group-profile" aria-label="Group info">
    <h4>About this group</h4>
    {!editing || !canEdit ? <><p className="chat-group-description">{conversation.description || 'No description yet.'}</p>{canEdit && <button type="button" className="chat-secondary-button" onClick={begin}>Edit group info</button>}</> : <form onSubmit={save}>
      <label>Group description<textarea aria-label="Group description" maxLength={2000} value={description} disabled={busy} onChange={event => setDescription(event.target.value)} rows={4} /></label>
      <label>Group photo<input aria-label="Group photo" type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={busy} onChange={event => { setPhoto(event.target.files?.[0] || null); setRemovePhoto(false); }} /></label>
      <small>JPEG, PNG, GIF or WebP · Up to 5 MB</small>
      {conversation.group_photo_url && <label className="chat-group-permission"><input type="checkbox" disabled={busy} checked={removePhoto} onChange={event => { setRemovePhoto(event.target.checked); if (event.target.checked) setPhoto(null); }} />Remove group photo</label>}
      {conversation.can_edit_group && <label className="chat-group-permission"><input type="checkbox" disabled={busy} checked={allowMembers} onChange={event => setAllowMembers(event.target.checked)} />Allow all group members to edit the photo and description</label>}
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2"><button type="submit" className="chat-primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save group info'}</button><button type="button" className="chat-secondary-button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div>
    </form>}
  </section>;
}
