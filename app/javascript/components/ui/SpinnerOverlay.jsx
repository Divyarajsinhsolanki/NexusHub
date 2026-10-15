import React from 'react';
import PageLoader from './PageLoader';
export default function SpinnerOverlay({ message = 'Please wait while we finish your request…' }) {
  return <PageLoader overlay title="Working" message={message} />;
}
