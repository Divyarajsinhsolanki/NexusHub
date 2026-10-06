// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import Avatar from './Avatar';
afterEach(cleanup);

it('uses stable, varied fallback colors and falls back when an image fails', () => {
  const { rerender } = render(<Avatar name="Alice" />);
  const aliceColor = screen.getByLabelText("Alice's avatar").style.backgroundColor;
  rerender(<Avatar name="Bob" />);
  expect(screen.getByLabelText("Bob's avatar").style.backgroundColor).not.toBe(aliceColor);
  rerender(<Avatar name="Alice" src="/missing.png" />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByLabelText("Alice's avatar").style.backgroundColor).toBe(aliceColor);
});
