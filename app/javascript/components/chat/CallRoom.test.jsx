// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children }) => <div data-testid="livekit-room">{children}</div>,
  ParticipantTile: () => <div />,
  RoomAudioRenderer: () => null,
  StartMediaButton: (props) => <button type="button" {...props}>Allow media</button>,
  useParticipants: () => [],
  useTrackToggle: () => ({ buttonProps: {}, enabled: true }),
  useTracks: () => [],
}));

vi.mock("livekit-client", () => ({
  Track: { Source: { Microphone: "microphone", Camera: "camera", ScreenShare: "screen_share" } },
}));

import CallRoom from "./CallRoom";

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => cleanup());

describe("CallRoom responsive layout", () => {
  it("uses a fixed mobile call surface without desktop window controls", () => {
    const { container } = render(
      <CallRoom
        callSession={{ id: 4, call_type: "video", status: "active", can_end: true, participants: [], started_at: "2026-08-12T08:00:00Z" }}
        credentials={{ server_url: "wss://livekit.example.test", participant_token: "token" }}
        onLeave={vi.fn()}
        onEnd={vi.fn()}
      />
    );

    const frame = container.querySelector(".call-room-mobile-frame");
    expect(frame).toBeTruthy();
    expect(frame.style.transform).toBe("");
    expect(screen.queryByRole("button", { name: /resize call window/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /copy meeting link/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /full screen/i })).toBeNull();
    expect(screen.getByTestId("livekit-room")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /leave call/i })).toHaveLength(1);
  });
});
