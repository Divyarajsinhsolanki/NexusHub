import { useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { updatePresence } from './api';

export default function PresenceHeartbeat() {
  const { user } = useContext(AuthContext);
  useEffect(() => {
    if (!user?.id || user.demo_account) return;
    let pending = false;
    const publish = async () => {
      if (pending || document.visibilityState === 'hidden' || navigator.onLine === false) return;
      pending = true;
      try { await updatePresence(); } catch { /* Retry on the next heartbeat or return to the app. */ }
      finally { pending = false; }
    };
    void publish();
    const timer = window.setInterval(publish, 30_000);
    window.addEventListener('focus', publish);
    window.addEventListener('online', publish);
    document.addEventListener('visibilitychange', publish);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', publish);
      window.removeEventListener('online', publish);
      document.removeEventListener('visibilitychange', publish);
    };
  }, [user?.id, user?.demo_account]);
  return null;
}
