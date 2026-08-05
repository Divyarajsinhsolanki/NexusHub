export const getOutgoingReceiptStatus = (message, participants = []) => {
  const recipients = participants.filter((participant) => (
    Number(participant.id) !== Number(message.user_id) &&
    (!participant.joined_at || new Date(participant.joined_at) <= new Date(message.created_at))
  ));
  const deliveredBy = recipients.filter((participant) => (
    Number(participant.last_delivered_message_id || 0) >= Number(message.id)
  ));
  const readBy = recipients.filter((participant) => (
    Number(participant.last_read_message_id || 0) >= Number(message.id)
  ));

  return {
    recipients,
    deliveredBy,
    readBy,
    allDelivered: recipients.length > 0 && deliveredBy.length === recipients.length,
    allRead: recipients.length > 0 && readBy.length === recipients.length
  };
};
