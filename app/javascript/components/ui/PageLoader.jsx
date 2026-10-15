import React from 'react';
import './loading.css';

const MESSAGES = {
  default: 'Preparing your workspace…',
  auth: 'Checking your session…',
  project: 'Loading project dashboard…',
};

export default function PageLoader({ message = MESSAGES.default, title = 'Loading', compact = false, overlay = false }) {
  return <div className={`workspace-loading ${compact ? 'workspace-loading--compact' : ''} ${overlay ? 'workspace-loading--overlay' : ''}`}>
    <div className="workspace-loading-card" role="status" aria-live="polite" aria-busy="true">
      <div className="workspace-loading-heading"><span className="workspace-loading-mark" aria-hidden="true"><span /><span /><span /></span><div className="workspace-loading-copy"><p className="workspace-loading-title">{title}</p><p className="workspace-loading-message">{message}</p></div></div>
      <div className="workspace-loading-track" aria-hidden="true"><span /></div>
    </div>
  </div>;
}
export { MESSAGES };
