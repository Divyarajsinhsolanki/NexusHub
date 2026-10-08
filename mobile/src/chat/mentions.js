const COMPOSER_ENTITY_REGEX = /(^|\s)([@#])([a-zA-Z0-9._-]*)$/;
const MESSAGE_ENTITY_REGEX = /(^|[\s([{])([@#])([a-zA-Z0-9][a-zA-Z0-9._-]*)/g;

const normalizeMentionValue = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");

export const normalizeTaskReferenceKey = (value = "") =>
  value.toString().trim().toLowerCase();

export const getUserMentionAliases = (user = {}) => {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();

  return Array.from(
    new Set(
      [
        user?.email?.split("@")?.[0],
        user?.name,
        fullName,
        user?.first_name
      ]
        .map(normalizeMentionValue)
        .filter(Boolean)
    )
  );
};

export const getPreferredUserMentionHandle = (user = {}) =>
  getUserMentionAliases(user)[0] || normalizeMentionValue(user?.name || "");

export const getTaskReferenceKey = (task = {}) =>
  normalizeTaskReferenceKey(task?.task_id || task?.id || "");

export const getComposerEntityQuery = (text = "", selectionStart = 0) => {
  if (!Number.isInteger(selectionStart) || selectionStart < 0) return null;

  const prefix = text.slice(0, selectionStart);
  const match = prefix.match(COMPOSER_ENTITY_REGEX);

  if (!match) return null;

  const trigger = match[2];
  const query = match[3] || "";

  return {
    trigger,
    query,
    start: selectionStart - query.length - 1,
    end: selectionStart
  };
};

export const applyComposerEntity = (text = "", composerEntity, replacement = "") => {
  if (!composerEntity || replacement === "") {
    return {
      value: text,
      selectionStart: composerEntity?.end || 0,
      selectionEnd: composerEntity?.end || 0
    };
  }

  const suffix = text.slice(composerEntity.end);
  const needsTrailingSpace = suffix.length === 0 || !/^\s/.test(suffix);
  const insertedText = `${replacement}${needsTrailingSpace ? " " : ""}`;
  const value = `${text.slice(0, composerEntity.start)}${insertedText}${suffix}`;
  const caret = composerEntity.start + insertedText.length;

  return {
    value,
    selectionStart: caret,
    selectionEnd: caret
  };
};

export const tokenizeChatMessage = (text = "", { usersByHandle = {}, tasksByKey = {} } = {}) => {
  if (!text) return [];

  const segments = [];
  let lastIndex = 0;
  let match;

  MESSAGE_ENTITY_REGEX.lastIndex = 0;

  while ((match = MESSAGE_ENTITY_REGEX.exec(text)) !== null) {
    const leading = match[1] || "";
    const trigger = match[2];
    const rawKey = match[3];
    const punctuationMatch = rawKey.match(/^(.*?)([.,!?;:)\]}]+)$/);
    const resolvedKey = punctuationMatch ? punctuationMatch[1] : rawKey;
    const trailingPunctuation = punctuationMatch ? punctuationMatch[2] : "";
    const tokenStart = match.index + leading.length;
    const tokenBodyEnd = tokenStart + 1 + resolvedKey.length;
    const tokenEnd = tokenStart + 1 + rawKey.length;
    const raw = text.slice(tokenStart, tokenBodyEnd);

    if (tokenStart > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, tokenStart) });
    }

    if (trigger === "@") {
      const user = usersByHandle[normalizeMentionValue(resolvedKey)];

      if (user) {
        const displayName =
          user?.name ||
          [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
          user?.email ||
          resolvedKey;

        segments.push({
          kind: "user",
          raw,
          text: `@${displayName}`,
          searchText: `@${displayName} ${user?.email || ""}`.trim(),
          user
        });
      } else {
        segments.push({ kind: "text", text: raw });
      }
    } else {
      const task = tasksByKey[normalizeTaskReferenceKey(resolvedKey)];

      if (task) {
        const taskLabel = task?.task_id || resolvedKey;
        const taskTitle = task?.title || "";

        segments.push({
          kind: "task",
          raw,
          text: `#${taskLabel}`,
          searchText: `#${taskLabel} ${taskTitle}`.trim(),
          task
        });
      } else {
        segments.push({ kind: "text", text: raw });
      }
    }

    if (trailingPunctuation) {
      segments.push({ kind: "text", text: trailingPunctuation });
    }

    lastIndex = tokenEnd;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return segments;
};

export const resolveChatMessageText = (text = "", lookups = {}) =>
  tokenizeChatMessage(text, lookups)
    .map((segment) => segment.text)
    .join("");
