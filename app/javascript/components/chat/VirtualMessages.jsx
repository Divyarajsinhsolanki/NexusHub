import React, { useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

// Measured rows keep attachments and wrapped text compatible with windowing.
export default function VirtualMessages(props) {
  if (props.messages.length <= 60) return <SmallMessages {...props} />;
  return <WindowedMessages {...props} />;
}
function SmallMessages({ messages, renderMessage, targetId, scrollRef, anchor, onAnchorRestored }) {
  const root = useRef(null);
  useScrollAnchor(scrollRef, anchor, onAnchorRestored, messages);
  useLayoutEffect(() => {
    if (targetId) root.current?.querySelector(`[data-message-id="${targetId}"]`)?.scrollIntoView?.({ block: "center" });
  }, [targetId]);
  return <div ref={root}>{messages.map((message, index) => <div key={message.id} data-message-id={message.id}>{renderMessage(message, index)}</div>)}</div>;
}
function WindowedMessages({ messages, scrollRef, renderMessage, targetId, anchor, onAnchorRestored }) {
  const root = useRef(null);
  const virtual = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => messages[index].id,
    estimateSize: () => 100,
    overscan: 8,
    scrollMargin: root.current?.offsetTop || 0,
    initialRect: { width: 800, height: 700 },
  });
  useScrollAnchor(scrollRef, anchor, onAnchorRestored, messages, virtual);
  useLayoutEffect(() => {
    if (!targetId) return;
    const index = messages.findIndex((message) => Number(message.id) === Number(targetId));
    if (index >= 0) virtual.scrollToIndex(index, { align: "center" });
  }, [targetId, messages, virtual]);
  return <div ref={root} style={{ height: virtual.getTotalSize(), position: "relative", overflowAnchor: "none" }}>
    {virtual.getVirtualItems().map((row) => <div key={row.key} data-message-id={messages[row.index].id} data-index={row.index}
      ref={virtual.measureElement} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start - virtual.options.scrollMargin}px)` }}>
      {renderMessage(messages[row.index], row.index)}
    </div>)}
  </div>;
}


// Preserve the visible message through prepends and the first switch to windowing.
// Correct against measured DOM positions while variable-height rows settle.
function useScrollAnchor(scrollRef, anchor, onRestored, messages, virtual) {
  const onRestoredRef = useRef(onRestored);
  onRestoredRef.current = onRestored;
  useLayoutEffect(() => {
    if (!anchor || !scrollRef.current) return;
    const container = scrollRef.current;
    const index = messages.findIndex((message) => Number(message.id) === anchor.id);
    if (index < 0) return;
    if (virtual) {
      const offset = virtual.getOffsetForIndex(index, "start")?.[0];
      if (offset !== undefined) virtual.scrollToOffset(offset - anchor.offset);
    }
    let frame;
    let attempts = 0;
    let stable = 0;
    const restore = () => {
      const row = container.querySelector(`[data-message-id="${anchor.id}"]`);
      if (row) {
        const delta = row.getBoundingClientRect().top - container.getBoundingClientRect().top - anchor.offset;
        if (Math.abs(delta) > 1) { container.scrollTop += delta; stable = 0; }
        else stable++;
      }
      if (++attempts < 12 && stable < 3) frame = requestAnimationFrame(restore);
      else onRestoredRef.current?.();
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [anchor, messages, scrollRef, virtual]);
}
