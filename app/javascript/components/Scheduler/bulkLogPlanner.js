export const EMPTY_ARRAY = [];

export const WORK_STAGES = [
  {
    key: 'code',
    label: 'Code',
    logType: 'Code',
    hourField: 'dev_hours',
    assignment: 'developer',
    fallbackTaskType: 'Code',
  },
  {
    key: 'code_review',
    label: 'Code Review',
    logType: 'Code review',
    hourField: 'code_review_hours',
    assignment: 'reviewer',
  },
  {
    key: 'dev_to_qa',
    label: 'Dev to QA',
    logType: 'Dev to QA',
    hourField: 'dev_to_qa_hours',
    assignment: 'developer',
  },
  {
    key: 'qa',
    label: 'QA',
    logType: 'Testing',
    hourField: 'qa_hours',
    assignment: 'qa',
    fallbackTaskType: 'qa',
  },
  {
    key: 'automation_qa',
    label: 'Automation QA',
    logType: 'Automation QA',
    hourField: 'automation_qa_hours',
    assignment: 'qa',
  },
];

const STAGE_KEY_BY_LOG_TYPE = {
  code: 'code',
  'code review': 'code_review',
  review: 'code_review',
  'dev to qa': 'dev_to_qa',
  dev2qa: 'dev_to_qa',
  'dev qa': 'dev_to_qa',
  testing: 'qa',
  qa: 'qa',
  'automation qa': 'automation_qa',
  automationqa: 'automation_qa',
};

export const numberOrZero = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

export const formatHours = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '0h';
  const normalized = numericValue.toFixed(2).replace(/\.0+$/, '').replace(/\.(\d*?)0+$/, '.$1');
  return `${normalized}h`;
};

export const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const stageKeyFor = (taskId, stageKey) => `${taskId}:${stageKey}`;

const taskIdFromLog = (log) => log?.task_id ?? log?.task?.id;

const dateWindowFor = (dates = []) => {
  const sortedDates = [...dates].filter(Boolean).sort();
  if (!sortedDates.length) return null;

  return {
    start: sortedDates[0],
    end: sortedDates[sortedDates.length - 1],
  };
};

export const logFallsWithinDateWindow = (log, dates = []) => {
  const window = dateWindowFor(dates);
  if (!window) return true;

  const logDate = log?.log_date ?? log?.logDate;
  return Boolean(logDate && logDate >= window.start && logDate <= window.end);
};

export const logsWithinDateWindow = (logs = [], dates = []) =>
  logs.filter((log) => logFallsWithinDateWindow(log, dates));

export const resolveDefaultLogDate = (dates = []) => {
  if (!dates.length) return '';

  const today = new Date().toISOString().slice(0, 10);
  if (dates.includes(today)) return today;
  return dates[dates.length - 1] || dates[0];
};

export const buildLoggedHoursByTaskStage = (logs = [], dates = []) =>
  logsWithinDateWindow(logs, dates).reduce((accumulator, log) => {
    const taskId = taskIdFromLog(log);
    const stageKey = STAGE_KEY_BY_LOG_TYPE[normalizeText(log?.type)];
    if (!taskId || !stageKey || log?.deleted) return accumulator;

    const key = stageKeyFor(taskId, stageKey);
    accumulator[key] = (accumulator[key] || 0) + numberOrZero(log.hours_logged);
    return accumulator;
  }, {});

export const buildDailyHoursByMemberDate = (logs = []) =>
  logs.reduce((accumulator, log) => {
    const developerId = log?.developer_id ?? log?.developerId;
    const logDate = log?.log_date ?? log?.logDate;
    if (!developerId || !logDate || log?.deleted) return accumulator;

    if (!accumulator[String(developerId)]) accumulator[String(developerId)] = {};
    accumulator[String(developerId)][logDate] = (accumulator[String(developerId)][logDate] || 0) + numberOrZero(log.hours_logged);
    return accumulator;
  }, {});

export const buildLastLogDateByTaskStage = (logs = []) =>
  logs.reduce((accumulator, log) => {
    const taskId = taskIdFromLog(log);
    const logDate = log?.log_date ?? log?.logDate;
    const stageKey = STAGE_KEY_BY_LOG_TYPE[normalizeText(log?.type)];
    if (!taskId || !logDate || !stageKey || log?.deleted) return accumulator;

    const key = stageKeyFor(taskId, stageKey);
    if (!accumulator[key] || logDate > accumulator[key]) {
      accumulator[key] = logDate;
    }
    return accumulator;
  }, {});

export const appendOrMergeEntry = (entries, nextEntry) => {
  const existingEntry = entries.find((entry) => (
    entry.task_id === nextEntry.task_id &&
    entry.developer_id === nextEntry.developer_id &&
    entry.log_date === nextEntry.log_date &&
    entry.type === nextEntry.type
  ));

  if (existingEntry) {
    existingEntry.hours_logged += nextEntry.hours_logged;
    return;
  }

  entries.push(nextEntry);
};

const normalizedTaskOrder = (task) => {
  const order = Number(task?.order);
  return Number.isFinite(order) && order > 0 ? order : Number.MAX_SAFE_INTEGER;
};

export const sortTasks = (left, right, leftIndex = 0, rightIndex = 0) => {
  const leftOrder = normalizedTaskOrder(left);
  const rightOrder = normalizedTaskOrder(right);
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;

  return leftIndex - rightIndex;
};

const stageIsVisibleForView = (stage, viewMode) => {
  if (viewMode === 'qa') return ['qa', 'automation_qa'].includes(stage.key);
  if (viewMode === 'dev') return !['qa', 'automation_qa'].includes(stage.key);
  return true;
};

const buildMemberTokens = (member) => {
  const fullName = [member?.first_name, member?.last_name].filter(Boolean).join(' ');
  return [
    member?.id,
    member?.name,
    member?.email,
    member?.first_name,
    member?.last_name,
    fullName,
  ].filter((value) => value !== null && value !== undefined && value !== '');
};

export const buildMemberLookup = (members = []) =>
  members.reduce((accumulator, member) => {
    buildMemberTokens(member).forEach((token) => {
      const normalized = normalizeText(token);
      if (normalized) accumulator[normalized] = String(member.id);
    });
    return accumulator;
  }, {});

const findAvailableMemberId = (candidates, availableIds) => {
  const matchingId = candidates.find((candidateId) => (
    candidateId !== null &&
    candidateId !== undefined &&
    candidateId !== '' &&
    availableIds.has(String(candidateId))
  ));

  return matchingId ? String(matchingId) : '';
};

const findMemberIdByText = (labels, memberLookup, availableIds) => {
  const matchingId = labels
    .map((label) => memberLookup[normalizeText(label)])
    .find((id) => id && availableIds.has(String(id)));

  return matchingId ? String(matchingId) : '';
};

export const resolveStageDeveloperId = (task, developers, stage) => {
  const safeDevelopers = Array.isArray(developers) ? developers : EMPTY_ARRAY;
  const availableIds = new Set(safeDevelopers.map((developer) => String(developer.id)));
  const memberLookup = buildMemberLookup(safeDevelopers);

  if (stage.assignment === 'reviewer') {
    return findAvailableMemberId(
      [task?.assigned_to_user, task?.assigned_user?.id],
      availableIds
    );
  }

  if (stage.assignment === 'qa') {
    return (
      findMemberIdByText(
        [
          task?.qa_assigned,
          task?.internal_qa,
          task?.assigned_user?.name,
          task?.assigned_user?.email,
        ],
        memberLookup,
        availableIds
      ) ||
      findAvailableMemberId(
        [task?.assigned_to_user, task?.assigned_user?.id],
        availableIds
      ) ||
      findAvailableMemberId(
        [task?.developer_id, task?.developer?.id],
        availableIds
      )
    );
  }

  return findAvailableMemberId(
    [task?.developer_id, task?.developer?.id],
    availableIds
  );
};

const hasBreakdownHours = (task) =>
  WORK_STAGES.some((stage) => numberOrZero(task?.[stage.hourField]) > 0);

export const plannedHoursForStage = (task, stage) => {
  const explicitHours = numberOrZero(task?.[stage.hourField]);
  if (explicitHours > 0) return explicitHours;

  if (hasBreakdownHours(task) || task?.type !== stage.fallbackTaskType) {
    return 0;
  }

  return numberOrZero(task?.estimated_hours) || numberOrZero(task?.total_hours);
};

export const buildTaskStageRows = ({ tasks, existingLogs, developers, dates = [], viewMode = 'combined' }) => {
  const loggedHoursByTaskStage = buildLoggedHoursByTaskStage(existingLogs, dates);

  return [...(Array.isArray(tasks) ? tasks : EMPTY_ARRAY)]
    .map((task, sourceIndex) => ({ task, sourceIndex }))
    .sort((left, right) => sortTasks(left.task, right.task, left.sourceIndex, right.sourceIndex))
    .flatMap(({ task, sourceIndex }, taskPosition) => WORK_STAGES
      .map((stage, stageIndex) => {
        if (!stageIsVisibleForView(stage, viewMode)) return null;

        const plannedHours = plannedHoursForStage(task, stage);
        if (plannedHours <= 0) return null;

        const rowKey = stageKeyFor(task.id, stage.key);
        const loggedHours = numberOrZero(loggedHoursByTaskStage[rowKey]);
        const remainingHours = plannedHours - loggedHours;
        const suggestedHours = remainingHours > 0 ? remainingHours : 0;

        return {
          rowId: rowKey,
          taskId: task.id,
          taskKey: task.task_id,
          taskUrl: task.task_url,
          title: task.title,
          taskOrder: normalizedTaskOrder(task),
          taskPosition,
          sourceIndex,
          stageKey: stage.key,
          stageOrder: stageIndex,
          stageLabel: stage.label,
          logType: stage.logType,
          plannedHours,
          loggedHours,
          remainingHours,
          developerId: resolveStageDeveloperId(task, developers, stage),
          hours: suggestedHours > 0 ? String(suggestedHours) : '',
          selected: suggestedHours > 0,
        };
      })
      .filter(Boolean));
};

const nextDistributionDateAfter = (distributionDates, date) =>
  distributionDates.find((candidateDate) => candidateDate > date);

const maxDate = (dates) =>
  dates.filter(Boolean).sort().slice(-1)[0];

const previousStageRowsFor = (rows, row) =>
  rows
    .filter((candidate) => (
      candidate.taskId === row.taskId &&
      candidate.stageOrder < row.stageOrder &&
      numberOrZero(candidate.plannedHours) > 0
    ))
    .sort((left, right) => left.stageOrder - right.stageOrder);

const earliestDateForStage = ({ rows, row, distributionDates, lastLogDateByTaskStage, startDate }) => {
  const previousRows = previousStageRowsFor(rows, row);
  const lastPreviousDate = maxDate(
    previousRows.map((previousRow) => lastLogDateByTaskStage[stageKeyFor(previousRow.taskId, previousRow.stageKey)])
  );

  if (!lastPreviousDate || lastPreviousDate < startDate) return startDate;

  const lastSprintDate = distributionDates[distributionDates.length - 1];
  if (!lastSprintDate || lastPreviousDate >= lastSprintDate) return lastSprintDate || startDate;

  return nextDistributionDateAfter(distributionDates, lastPreviousDate) || lastSprintDate;
};

export const validateStageSelection = (rows = []) => {
  const selectedRows = rows.filter((row) => row.selected && numberOrZero(row.hours) > 0);

  const invalidRow = selectedRows.find((row) => !row.developerId || numberOrZero(row.hours) <= 0);
  if (invalidRow) {
    return {
      valid: false,
      message: `Complete the assignee and hours for ${invalidRow.taskKey || invalidRow.title} ${invalidRow.stageLabel}.`,
    };
  }

  const blockedSelection = selectedRows.reduce((result, row) => {
    if (result) return result;

    const blockedBy = previousStageRowsFor(rows, row).find((previousRow) => {
      const plannedHours = numberOrZero(previousRow.plannedHours);
      const coveredHours = numberOrZero(previousRow.loggedHours) + (previousRow.selected ? numberOrZero(previousRow.hours) : 0);
      return plannedHours > 0 && coveredHours < plannedHours;
    });

    return blockedBy ? { row, blockedBy } : null;
  }, null);

  if (blockedSelection) {
    return {
      valid: false,
      message: `${blockedSelection.row.stageLabel} for ${blockedSelection.row.taskKey || blockedSelection.row.title} needs ${blockedSelection.blockedBy.stageLabel} completed first.`,
    };
  }

  return { valid: true, message: '' };
};

export const buildDistributionPlan = ({ rows, dates, startDate, maxHoursPerDay, existingLogs }) => {
  const distributionDates = dates.filter((date) => date >= startDate);
  const perDayLimit = numberOrZero(maxHoursPerDay);
  const scopedExistingLogs = logsWithinDateWindow(existingLogs, dates);
  const dailyHoursByMemberDate = buildDailyHoursByMemberDate(scopedExistingLogs);
  const lastLogDateByTaskStage = buildLastLogDateByTaskStage(scopedExistingLogs);
  const selectedRows = rows
    .filter((row) => row.selected && row.developerId && numberOrZero(row.hours) > 0)
    .sort((left, right) => (
      left.taskOrder - right.taskOrder ||
      left.taskPosition - right.taskPosition ||
      left.stageOrder - right.stageOrder
    ));

  const entries = [];
  let overflowHours = 0;
  let overflowTasks = 0;

  selectedRows.forEach((row) => {
    const developerId = String(row.developerId);
    let remainingHours = numberOrZero(row.hours);
    let lastAssignedDate = null;
    const earliestDate = earliestDateForStage({
      rows,
      row,
      distributionDates,
      lastLogDateByTaskStage,
      startDate,
    });
    const availableDates = distributionDates.filter((date) => date >= earliestDate);

    availableDates.forEach((date) => {
      if (remainingHours <= 0 || perDayLimit <= 0) return;

      const currentHours = dailyHoursByMemberDate[developerId]?.[date] || 0;
      const availableHours = Math.max(perDayLimit - currentHours, 0);
      if (availableHours <= 0) return;

      const assignedHours = Math.min(remainingHours, availableHours);
      appendOrMergeEntry(entries, {
        task_id: row.taskId,
        developer_id: Number(developerId),
        log_date: date,
        type: row.logType,
        hours_logged: assignedHours,
        status: 'todo',
      });

      if (!dailyHoursByMemberDate[developerId]) dailyHoursByMemberDate[developerId] = {};
      dailyHoursByMemberDate[developerId][date] = currentHours + assignedHours;
      remainingHours -= assignedHours;
      lastAssignedDate = date;
    });

    if (remainingHours > 0 && distributionDates.length) {
      const lastDate = distributionDates[distributionDates.length - 1];
      appendOrMergeEntry(entries, {
        task_id: row.taskId,
        developer_id: Number(developerId),
        log_date: lastDate,
        type: row.logType,
        hours_logged: remainingHours,
        status: 'todo',
      });

      if (!dailyHoursByMemberDate[developerId]) dailyHoursByMemberDate[developerId] = {};
      dailyHoursByMemberDate[developerId][lastDate] = (dailyHoursByMemberDate[developerId][lastDate] || 0) + remainingHours;
      overflowHours += remainingHours;
      overflowTasks += 1;
      lastAssignedDate = lastDate;
    }

    if (lastAssignedDate) {
      const key = stageKeyFor(row.taskId, row.stageKey);
      if (!lastLogDateByTaskStage[key] || lastAssignedDate > lastLogDateByTaskStage[key]) {
        lastLogDateByTaskStage[key] = lastAssignedDate;
      }
    }
  });

  return {
    entries,
    selectedRows,
    distributionDates,
    overflowHours,
    overflowTasks,
  };
};
