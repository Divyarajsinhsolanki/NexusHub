import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import logo from '../../images/logo.webp';
import AuthWorkspaceScene from './AuthWorkspaceScene';
import './AuthLayout.css';

export default function AuthLayout({ children }) {
  return <main className="auth-shell">
    <header className="auth-shell-header"><Link to="/login" className="auth-brand"><img src={logo} alt="" /><span>NexusHub</span></Link><Link to="/" className="auth-about">Explore NexusHub <ArrowUpRight size={16} /></Link></header>
    <div className="auth-shell-content">
      <section className="auth-workspace" aria-label="NexusHub workspace">
        <div className="auth-workspace-copy"><span className="auth-eyebrow">A place for your best work</span><h1>NexusHub</h1><p>Your projects, conversations and knowledge.<br />Together, with room to focus.</p></div>
        <AuthWorkspaceScene />
        <div className="auth-workspace-caption"><span className="auth-status-dot" /> Connected work. Clearer days.</div>
      </section>
      <section className="auth-form-panel" aria-label="Account access">{children}</section>
    </div>
    <footer className="auth-shell-footer"><span><ShieldCheck size={15} /> A secure space for your team</span><div><Link to="/legal">Privacy &amp; Terms</Link></div></footer>
  </main>;
}
