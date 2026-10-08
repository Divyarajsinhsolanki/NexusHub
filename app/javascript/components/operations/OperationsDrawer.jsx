import React from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { FiX } from 'react-icons/fi';

export default function OperationsDrawer({ title, subtitle, onClose, busy, children }) {
  return <Dialog open onClose={() => { if (!busy) onClose(); }} className="operations-dialog">
    <div className="operations-backdrop" aria-hidden="true" />
    <div className="operations-drawer-position"><DialogPanel className="operations-drawer ops-workspace">
      <header className="ops-drawer-header"><div><DialogTitle>{title}</DialogTitle>{subtitle && <p>{subtitle}</p>}</div><button type="button" aria-label="Close details" disabled={busy} onClick={onClose}><FiX /></button></header>
      {children}
    </DialogPanel></div>
  </Dialog>;
}

export function Field({ label, children, hint }) {
  return <label className="ops-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function CheckList({ label, options, selected = [], onChange, unavailableLabel = 'Unavailable record' }) {
  const choices = [...options, ...selected.filter(id => !options.some(option => String(option.id) === String(id))).map(id => ({ id, name: `${unavailableLabel} #${id}` }))];
  return <fieldset className="ops-checklist"><legend>{label}</legend>{choices.length ? choices.map(option => <label key={option.id}><input type="checkbox" checked={selected.map(String).includes(String(option.id))} onChange={event => onChange(event.target.checked ? [...selected, option.id] : selected.filter(id => String(id) !== String(option.id)))} />{option.name}</label>) : <p className="ops-muted">None available</p>}</fieldset>;
}
