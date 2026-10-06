// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import MemberContactActions from './MemberContactActions';
import { createCall, joinCall, startDirectConversation } from '../api';
vi.mock('../../context/AuthContext', async () => ({ AuthContext: (await import('react')).createContext({ user: { id: 1 } }) }));
vi.mock('../api', () => ({ startDirectConversation: vi.fn(async () => ({ data: { id: 8 } })), createCall: vi.fn(async () => ({ data: { call_session: { id: 9 } } })), joinCall: vi.fn(async () => ({ data: { call_session: { id: 9, public_id: 'meeting-id' }, server_url: 'wss://example.com', participant_token: 'token' } })) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const Destination = () => { const location = useLocation(); return <p>{location.pathname}</p>; };
const setup = (id = 2) => render(<MemoryRouter><Routes><Route path="/" element={<MemberContactActions userId={id} />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter>);
it('opens a direct text conversation', async () => {
  setup(); fireEvent.click(screen.getByLabelText('Message'));
  await screen.findByText('/chat/8'); expect(startDirectConversation).toHaveBeenCalledWith(2);
});
it('starts and joins a video call before navigating to its meeting', async () => {
  setup(); fireEvent.click(screen.getByLabelText('Video call'));
  await screen.findByText('/meet/meeting-id');
  expect(createCall).toHaveBeenCalledWith(8, 'video'); expect(joinCall).toHaveBeenCalledWith(9);
});
it('does not offer self calls', () => { setup(1); expect(screen.queryByLabelText('Voice call')).toBeNull(); });
