// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import SkillEndorsementsPanel from './SkillEndorsementsPanel';
afterEach(cleanup);
it('renders expert and endorsement profile pictures with initials on failure', () => {
  render(<SkillEndorsementsPanel teamExperts={[{ user_id: 1, name: 'Ada', skill_name: 'Ruby', profile_picture: '/ada.png', endorsements_count: 1 }]} recentEndorsements={[{ id: 1, endorser: { name: 'Grace', profile_picture: '/grace.png' }, endorsee: { name: 'Ada', profile_picture: '/ada.png' }, skill_name: 'Ruby', created_at_human: 'a minute' }]} />);
  expect(screen.getAllByRole('img', { name: "Ada's avatar" })).toHaveLength(2);
  const image = screen.getByRole('img', { name: "Grace's avatar" });
  expect(image.getAttribute('src')).toBe('/grace.png');
  fireEvent.error(image);
  expect(screen.getByLabelText("Grace's avatar").textContent).toBe('G');
});
