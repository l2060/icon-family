import { lazy, Suspense, useEffect, useState } from 'react';
import { App, Spin } from 'antd';
import { api, ApiError } from './api';
import type { User } from './types';
import { Login } from './features/auth/Login';
import { guardRoute } from './hooks/projectRoute';
import { useContextMenuPolicy } from './hooks/useContextMenuPolicy';
import { UserPreferencesProvider } from './userPreferences';
const ApplicationLayout = lazy(() =>
  import('./layouts/ApplicationLayout').then((module) => ({ default: module.ApplicationLayout })),
);

export function IconFamily() {
  useContextMenuPolicy();
  const { message } = App.useApp();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void api<{ user: User }>('/auth/me')
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch((e) => {
        if (active && !(e instanceof ApiError && e.status === 401)) message.error(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const expired = () => setUser(null);
    window.addEventListener('session-expired', expired);
    return () => {
      active = false;
      window.removeEventListener('session-expired', expired);
    };
  }, [message]);
  useEffect(() => {
    if (loading) return;
    const navigate = () => guardRoute(!!user);
    navigate();
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, [loading, user]);
  if (loading)
    return (
      <div className="loading-page">
        <Spin size="large" />
      </div>
    );
  return user ? (
    <Suspense
      fallback={
        <div className="loading-page">
          <Spin size="large" />
        </div>
      }
    >
      <UserPreferencesProvider key={`${user.id}:${user.username}`} user={user}>
        <ApplicationLayout
          user={user}
          onLogout={() => {
            void api('/auth/logout', 'POST')
              .then(() => {
                window.history.replaceState(null, '', '#/login');
                setUser(null);
              })
              .catch((e) => message.error(e.message));
          }}
        />
      </UserPreferencesProvider>
    </Suspense>
  ) : (
    <Login onLogin={setUser} />
  );
}
