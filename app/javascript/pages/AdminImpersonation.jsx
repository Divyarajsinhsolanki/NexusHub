import React from 'react';
import {Link} from 'react-router-dom';
export default function AdminImpersonation(){return <main className="mx-auto max-w-xl space-y-4 p-8 text-primary"><h1 className="text-2xl font-semibold">Controlled support access</h1><p>Employee impersonation has been replaced by owner-approved, expiring, read-only support grants.</p><Link className="underline" to="/settings?tab=security">Open Settings → Security to manage support access</Link></main>;}
