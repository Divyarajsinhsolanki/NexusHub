import React, { useState, useEffect, useRef, Fragment } from 'react';
import { Bell, Check, Clock, MessageSquare, Briefcase, FileText } from 'lucide-react';
import { Popover, Transition } from '@headlessui/react';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from './api';
import { subscribeToUserChat } from '../lib/chatCable';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const NotificationCenter = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    loadNotifications();

    // Replace polling with real-time subscription
    const sub = subscribeToUserChat((payload) => {
      if (payload?.type === "notification_received") {
        setNotifications(prev => [payload.notification, ...prev]);
        setUnreadCount(prev => prev + 1);
        if (payload.notification?.message) {
          toast(payload.notification.message, {
            id: `notification-${payload.notification.id}`,
            icon: payload.notification.action?.startsWith("chat") || payload.notification.action === "missed_call"
              ? <MessageSquare className="h-4 w-4 text-sky-200" />
              : <Bell className="h-4 w-4 text-sky-200" />,
          });
        }

        // Show browser notification if permitted
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new window.Notification(payload.notification.message);
        }
      }
    });

    return () => sub.unsubscribe();
  }, []);

  const loadNotifications = async () => {
    setLoadError(null);
    try {
      const response = await fetchNotifications({ page: 1 });
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.meta?.unread_count || 0);
    } catch (error) {
      if (error?.response?.status === 401) {
        setNotifications([]);
        setUnreadCount(0);
        setLoadError(null);
        return;
      }

      console.error("Failed to load notifications", error);
      setLoadError("Unable to load notifications right now.");
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      if (error?.response?.status === 401) return;
      console.error("Failed to mark read", error);
    }
  };

  const handleOpenNotification = async (notification, closePopover) => {
    const conversationId = notification.metadata?.conversation_id;

    if (!notification.read_at) {
      await handleMarkRead(notification.id);
    }

    if (conversationId) {
      closePopover?.();
      navigate(`/chat/${conversationId}`);
    }
  };

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (error) {
      if (error?.response?.status === 401) return;
      console.error("Failed to mark all read", error);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (action) => {
    switch (action) {
      case 'commented': return <MessageSquare className="w-4 h-4 text-info" />;
      case 'chat_message': return <MessageSquare className="w-4 h-4 text-theme" />;
      case 'chat_ping': return <MessageSquare className="w-4 h-4 text-theme-secondary" />;
      case 'missed_call': return <Bell className="w-4 h-4 text-warning" />;
      case 'assigned': return <Briefcase className="w-4 h-4 text-success" />;
      case 'update': return <FileText className="w-4 h-4 text-warning" />;
      default: return <Bell className="w-4 h-4 text-muted" />;
    }
  };

  return (
    <Popover className="relative">
      {({ open, close }) => (
        <>
          <Popover.Button
            className={`
              group inline-flex items-center justify-center rounded-full p-2
              text-shell-muted hover:bg-surface-card-hover hover:text-shell-text-strong focus:outline-none focus:ring-2 focus:ring-theme/35
              ${open ? 'bg-surface-card-hover text-shell-text-strong' : ''}
            `}
          >
            <span className="sr-only">Notifications</span>
            <div className="relative">
              <Bell className="h-6 w-6" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute right-0 top-0 block h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-danger ring-2 ring-surface-elevated" />
              )}
            </div>
          </Popover.Button>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-200"
            enterFrom="opacity-0 translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-1"
          >
            <Popover.Panel className="absolute right-0 z-50 mt-2 w-80 sm:w-96 transform px-4 sm:px-0 lg:max-w-3xl">
              <div className="overflow-hidden rounded-lg border border-shell-border shadow-shell-lg">
                <div className="bg-surface-elevated p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-medium text-shell-text-strong">Notifications</h2>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        disabled={loading}
                        className="text-xs font-medium text-theme hover:text-theme/80 disabled:opacity-50"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                    {loadError ? (
                      <p className="py-8 text-center text-sm text-danger">{loadError}</p>
                    ) : notifications.length === 0 ? (
                      <p className="py-8 text-center text-sm text-shell-muted">No notifications yet</p>
                    ) : (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          onClick={() => handleOpenNotification(notification, close)}
                          className={`relative -m-3 flex items-start rounded-lg p-3 transition duration-150 ease-in-out ${notification.read_at ? 'bg-surface-elevated hover:bg-surface-card-hover' : 'bg-info/10 hover:bg-info/15'
                            } ${notification.metadata?.conversation_id ? 'cursor-pointer' : ''}`}
                        >
                          <div className="flex-shrink-0 mt-1">
                            {notification.actor_avatar && (
                              <img
                                src={notification.actor_avatar}
                                alt=""
                                className="h-8 w-8 rounded-full border border-shell-border object-cover"
                              loading="lazy" />
                            )}
                            {!notification.actor_avatar && (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted-soft">
                                {getIcon(notification.action)}
                              </div>
                            )}
                          </div>
                          <div className="ml-4 flex-1">
                            <p className={`text-sm ${notification.read_at ? 'text-shell-muted' : 'font-medium text-shell-text-strong'}`}>
                              {notification.message}
                            </p>
                            <p className="mt-1 flex items-center text-xs text-shell-muted">
                              <Clock className="w-3 h-3 mr-1" />
                              {notification.created_at ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true }) : 'Just now'}
                            </p>
                          </div>
                          {!notification.read_at && (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                handleMarkRead(notification.id);
                              }}
                              className="ml-2 text-info/70 hover:text-info focus:outline-none"
                              title="Mark as read"
                            >
                              <div className="h-2 w-2 rounded-full bg-info"></div>
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="bg-shell-soft p-3 text-center">
                  <a href="/notifications" className="text-xs font-medium text-shell-muted hover:text-shell-text-strong">
                    View full history
                  </a>
                </div>
              </div>
            </Popover.Panel>
          </Transition>
        </>
      )}
    </Popover>
  );
};

export default NotificationCenter;
