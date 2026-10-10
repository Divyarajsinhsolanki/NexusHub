// Keep URL boundaries identical on web and mobile.
export function splitMessageLinks(text = "") {
  const parts = [];
  const pattern = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    let label = match[0].replace(/[.,!?;:]+$/, "");
    while (/[)\]}]$/.test(label)) {
      const closing = label.at(-1), opening = { ')': '(', ']': '[', '}': '{' }[closing];
      if (label.split(closing).length <= label.split(opening).length) break;
      label = label.slice(0, -1);
    }
    try {
      const url = new URL(/^www\./i.test(label) ? `https://${label}` : label);
      if (!url.hostname || url.username || url.password) continue;
      if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index) });
      parts.push({ text: label, url: url.href });
      cursor = match.index + label.length;
    } catch { /* Leave malformed URLs as ordinary text. */ }
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
