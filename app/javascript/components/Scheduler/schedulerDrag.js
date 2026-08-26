const SCHEDULER_DROP_ID = /^(\d{4}-\d{2}-\d{2}):(\d+)$/;

export function schedulerDropTarget(result) {
  const { destination, draggableId, source } = result || {};
  if (!destination || !draggableId) return null;
  if (
    source?.droppableId === destination.droppableId &&
    source?.index === destination.index
  ) return null;

  const match = String(destination.droppableId).match(SCHEDULER_DROP_ID);
  if (!match) return null;

  const developerId = Number(match[2]);
  if (!Number.isSafeInteger(developerId) || developerId <= 0) return null;

  return {
    taskId: String(draggableId),
    logDate: match[1],
    developerId,
  };
}

export function moveSchedulerLog(logs, target) {
  if (!target) return Array.isArray(logs) ? logs : [];
  return (Array.isArray(logs) ? logs : []).map((log) => (
    String(log.id) === target.taskId
      ? { ...log, log_date: target.logDate, developer_id: target.developerId }
      : log
  ));
}
