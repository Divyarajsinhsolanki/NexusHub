import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Building2, Mail, ShieldCheck, Users, CheckCircle2, BookOpen, Check, ChevronRight } from 'lucide-react';
import './GettingStarted.css';

const steps = [
  { id: 'create', title: 'Create your company workspace', icon: Building2, body: 'Open Sign Up and enter your company name, first and last name, email, and password. On mobile, confirm your password too. A profile picture is optional on the web. Submitting the form creates a new private workspace and makes you its owner.', note: 'Use an email address you can access. A company name or matching email domain does not join you to an existing workspace.' },
  { id: 'verify', title: 'Verify your email and sign in', icon: Mail, body: 'Open the verification email and follow its link. Then return to Nexus Hub and sign in with the same email and password. Creating an account does not sign you in automatically.', note: 'Check spam or junk folders if the email is missing. If signup reports that delivery failed, contact support using the contact details on the Privacy & Terms page before trying to sign in.' },
  { id: 'secure', title: 'Secure the owner account', icon: ShieldCheck, body: 'Owners and admins must set up an authenticator. Follow the security prompt, add the setup key to your authenticator app, and enter its six-digit code. Save your recovery codes somewhere secure outside your Nexus Hub account.', note: 'Each recovery code works once. Some sensitive actions ask you to verify your authenticator again.' },
  { id: 'invite', title: 'Invite your teammates', icon: Users, body: 'On the web, open People (User management) and choose Invite teammate. Enter their email and choose the appropriate roles and any project or department access. They join through the invitation email, rather than the public signup form.', note: 'Invitations require permission to manage invitations. Use the invitation controls to resend an unavailable or expired invitation, or revoke one that is no longer needed.' },
  { id: 'work', title: 'Set up your first work', icon: CheckCircle2, body: 'Create a project, add tasks, and assign work to teammates. Use chat for conversations and work logs to record time. The screens and actions each member can use depend on their permissions.', note: 'Use the same account to sign in on web and mobile. Each account currently belongs to one company workspace.' },
];
const joiningSteps = [
  { id: 'ask', title: 'Ask your company for an invitation', icon: Users, body: 'Ask your company owner or an authorized administrator to invite the email address you want to use. You do not need to create a separate company workspace.', note: 'Each account currently belongs to one workspace. If your email already belongs to another workspace, ask the inviter to use a different email address.' },
  { id: 'accept', title: 'Open your invitation email', icon: Mail, body: 'Follow the invitation link, check the company name and invited email, then enter the requested account details and accept. The page will guide you based on whether you already have an account.', note: 'If the link has expired or is unavailable, ask your company to resend the invitation. Do not share the private invitation link.' },
  { id: 'signin', title: 'Sign in and meet your team', icon: CheckCircle2, body: 'After accepting, sign in using the invited email and your password. Follow any security prompts. Your company controls the projects and features you can access.', note: 'You can use the same account on web and mobile. If something you need is missing, ask your company administrator to check your permissions.' },
];
const shortTitles = ['Create workspace', 'Verify email', 'Secure account', 'Invite teammates', 'Start your work'];

// Small vector illustrations, rather than screenshots of a form users might mistake for real inputs.
function StepIllustration({ kind }) {
  return <svg viewBox="0 0 320 210" className="guide-illustration" aria-hidden="true" focusable="false">
    <rect x="18" y="16" width="284" height="178" rx="26" fill="currentColor" opacity=".06" />
    <circle cx="260" cy="48" r="25" fill="currentColor" opacity=".1" />
    <circle cx="52" cy="165" r="18" fill="currentColor" opacity=".1" />
    {kind === 'create' ? <g stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
      <rect x="105" y="42" width="110" height="132" rx="12" fill="var(--guide-card)" />
      {[67, 96, 125].map(y => <g key={y}><path d={`M124 ${y}h15v14h-15zM180 ${y}h15v14h-15z`} fill="currentColor" opacity=".3" stroke="none" /></g>)}
      <path d="M149 174v-27h22v27M84 174h152" fill="none" />
      <circle cx="230" cy="131" r="25" fill="var(--guide-card)" /><path d="M218 131l8 8 16-18" fill="none" />
    </g> : kind === 'secure' ? <g stroke="currentColor" strokeWidth="4" strokeLinejoin="round">
      <path d="M160 37l64 23v49c0 31-28 54-64 71-36-17-64-40-64-71V60z" fill="var(--guide-card)" />
      <rect x="139" y="95" width="42" height="36" rx="7" fill="currentColor" opacity=".2" stroke="none" /><path d="M146 95V82a14 14 0 0128 0v13M149 112l8 8 15-18" fill="none" />
    </g> : ['verify', 'accept'].includes(kind) ? <g stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
      <rect x="79" y="68" width="162" height="101" rx="12" fill="var(--guide-card)" /><path d="M81 77l79 55 79-55M80 160l53-45m107 45l-53-45" fill="none" />
      <circle cx="230" cy="60" r="25" fill="var(--guide-card)" /><path d="M218 60l8 8 16-18" fill="none" />
    </g> : ['invite', 'ask'].includes(kind) ? <g stroke="currentColor" strokeWidth="3">
      {[92, 160, 228].map((x, i) => <g key={x} transform={`translate(0 ${i === 1 ? -17 : 0})`}><circle cx={x} cy="88" r="21" fill="var(--guide-card)" /><path d={`M${x - 29} 157v-12a29 29 0 0158 0v12z`} fill="currentColor" fillOpacity=".12" /></g>)}
      <path d="M136 182h48" strokeLinecap="round" />
    </g> : <g stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
      <rect x="91" y="39" width="138" height="140" rx="14" fill="var(--guide-card)" />
      {[78, 111, 144].map(y => <g key={y}><path d={`M109 ${y}l6 6 11-13M143 ${y}h65`} fill="none" strokeLinecap="round" /></g>)}
      <rect x="125" y="29" width="70" height="19" rx="7" fill="var(--guide-card)" />
    </g>}
  </svg>;
}

export default function GettingStarted() {
  const [audience, setAudience] = useState('owner');
  const [active, setActive] = useState(0);
  const [reviewed, setReviewed] = useState({ owner: [], join: [] });
  const currentSteps = audience === 'owner' ? steps : joiningSteps;
  const step = currentSteps[active];
  const progress = reviewed[audience];
  const chooseAudience = value => { setAudience(value); setActive(0); };
  const next = () => {
    setReviewed(previous => ({ ...previous, [audience]: [...new Set([...previous[audience], step.id])] }));
    if (active < currentSteps.length - 1) setActive(active + 1);
  };
  const tabKeyDown = event => {
    const offset = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    let target;
    if (offset) target = (active + offset + currentSteps.length) % currentSteps.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = currentSteps.length - 1;
    else return;
    event.preventDefault(); setActive(target);
    document.getElementById(`guide-tab-${currentSteps[target].id}`)?.focus();
  };
  return <main className="getting-started min-h-screen bg-app text-primary">
    <header className="guide-header">
      <div><p className="guide-eyebrow"><BookOpen size={17} aria-hidden="true" /> Nexus Hub · Quick start</p>
        <h1>Your company, ready to work.</h1>
        <p className="guide-intro">A few clear steps. One place for your team. Let’s get you started.</p>
      </div>
      <Link to="/login" className="guide-button guide-button-secondary">Already registered? Sign in <ArrowRight size={16} aria-hidden="true" /></Link>
    </header>
    <section className="guide-paths" aria-labelledby="choose-title">
      <div><p className="guide-eyebrow">START HERE</p><h2 id="choose-title">What brings you here?</h2><p className="text-muted">Choose your path. We’ll show you what to do next.</p></div>
      <div className="guide-path-options">
        <button type="button" aria-pressed={audience === 'owner'} onClick={() => chooseAudience('owner')} className="guide-path"><Building2 size={25} aria-hidden="true" /><span><strong>I’m setting up my company</strong><small>Create a workspace and invite your team</small></span><ChevronRight size={18} aria-hidden="true" /></button>
        <button type="button" aria-pressed={audience === 'join'} onClick={() => chooseAudience('join')} className="guide-path"><Users size={25} aria-hidden="true" /><span><strong>I’m joining my team</strong><small>Use an invitation from your company</small></span><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
    </section>
    <div className="guide-workspace">
      <aside className="guide-step-sidebar">
        <div className="guide-progress" aria-live="polite"><strong>Your guide</strong><span>{progress.length} / {currentSteps.length} reviewed</span></div>
        <progress aria-label="Guide review progress" max={currentSteps.length} value={progress.length} />
        <div role="tablist" aria-label="Setup steps" aria-orientation="vertical" className="guide-step-list">{currentSteps.map((item, index) => <button key={item.id} id={`guide-tab-${item.id}`} type="button" role="tab" aria-selected={active === index} aria-controls={`guide-panel-${item.id}`} tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} onKeyDown={tabKeyDown}>
          <span className="guide-step-number">{progress.includes(item.id) ? <Check size={17} aria-label="Reviewed" /> : index + 1}</span><span>{audience === 'owner' ? shortTitles[index] : ['Get invited', 'Accept invitation', 'Sign in'][index]}</span><ChevronRight size={16} aria-hidden="true" />
        </button>)}</div>
        <p className="guide-small text-muted">This checklist tracks what you’ve read here. It doesn’t create an account or change your workspace.</p>
      </aside>
      <section id={`guide-panel-${step.id}`} role="tabpanel" aria-labelledby={`guide-tab-${step.id}`} tabIndex={0} className="guide-detail">
        <div className="guide-detail-top"><div><p className="guide-eyebrow">STEP {active + 1} OF {currentSteps.length}</p><h2>{step.title}</h2></div><div className="guide-art"><StepIllustration kind={step.id} /><span>One step closer to working together</span></div></div>
        <p className="guide-body">{step.body}</p>
        <details className="guide-note" key={`${audience}-${step.id}`}><summary>Good to know</summary><p>{step.note}</p></details>
        {audience === 'join' && active === 0 && <p className="guide-small text-muted">Do not create a separate workspace to join your company. Your invitation connects you to the right team.</p>}
        <div className="guide-next-actions">
          <button type="button" className="guide-button guide-button-secondary" disabled={active === 0} onClick={() => setActive(active - 1)}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
          <button type="button" className="guide-button guide-button-primary" onClick={next}>{active < currentSteps.length - 1 ? 'Got it, next step' : progress.includes(step.id) ? 'Step reviewed' : 'Mark step reviewed'}<CheckCircle2 size={18} aria-hidden="true" /></button>
        </div>
      </section>
      <aside className="guide-ready">
        <span className="guide-ready-icon"><CheckCircle2 size={26} aria-hidden="true" /></span><h2>{audience === 'owner' ? 'Ready when you are.' : 'Your team is waiting.'}</h2>
        <p>{audience === 'owner' ? 'Start with your company name and email. We’ll guide you through the rest.' : 'Have an invitation? Open its email link first. Already accepted? You can sign in.'}</p>
        <Link to={audience === 'owner' ? '/signup' : '/login'} className="guide-button guide-button-primary">{audience === 'owner' ? 'Create a workspace' : 'Sign in to your account'}<ArrowRight size={17} aria-hidden="true" /></Link>
        <p className="guide-small">{audience === 'owner' ? 'Joining an existing company? Choose “I’m joining my team” above.' : 'No invitation yet? Ask your company owner or administrator.'}</p>
      </aside>
    </div>
    <footer className="guide-help"><div><h2>Need a hand?</h2><p>Missing an email? Check spam. Expired invitation? Ask your company to resend it. Forgot your password? Use the sign-in screen.</p></div><Link to="/legal" className="guide-button guide-button-secondary">Privacy &amp; Terms</Link><p className="guide-small">For account problems, use the operator contact on Privacy &amp; Terms. Never share passwords, authenticator keys, or recovery codes.</p></footer>
  </main>;
}
