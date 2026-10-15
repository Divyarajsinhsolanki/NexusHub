import React from 'react';
import './loading.css';
export default function LoadingIndicator({ label = 'Loading…', className = '' }) {
  return <span role="status" aria-live="polite" aria-busy="true" className={`workspace-loading-inline ${className}`}><span className="workspace-loading-ring" aria-hidden="true" /><span>{label}</span></span>;
}
