export const isLiveCall = (callSession) => ["ringing", "active"].includes(callSession?.status);

export const mergeCallIntoConversationGroups = (previous, callSession) => {
  if (!callSession) return previous;

  const activeCall = isLiveCall(callSession) ? callSession : null;
  const mergeConversation = (conversation) => (
    Number(conversation.id) === Number(callSession.conversation_id)
      ? { ...conversation, active_call: activeCall }
      : conversation
  );

  return {
    direct: (previous.direct || []).map(mergeConversation),
    group: (previous.group || []).map(mergeConversation)
  };
};
