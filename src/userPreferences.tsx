import { createContext, useContext, useState, type ReactNode } from 'react';
import type { User } from './types';

export type IconSort = {
  field: 'name' | 'created_at';
  direction: 'asc' | 'desc';
};
const defaultSort: IconSort = { field: 'created_at', direction: 'desc' };
const UserPreferences = createContext<{
  iconSort: IconSort;
  setIconSort: (sort: IconSort) => void;
}>(null!);

export function UserPreferencesProvider({ user, children }: { user: User; children: ReactNode }) {
  const key = `if-user-preferences:${user.id}:${user.username}`;
  const [iconSort, updateIconSort] = useState<IconSort>(() => {
    try {
      const sort = JSON.parse(localStorage.getItem(key) || 'null')?.iconSort;
      if (
        (sort?.field === 'name' || sort?.field === 'created_at') &&
        (sort.direction === 'asc' || sort.direction === 'desc')
      )
        return sort;
    } catch {
      /* Unavailable storage or invalid saved preferences use the default. */
    }
    return defaultSort;
  });
  function setIconSort(sort: IconSort) {
    updateIconSort(sort);
    try {
      localStorage.setItem(key, JSON.stringify({ iconSort: sort }));
    } catch {
      /* Sorting still works when browser storage is unavailable. */
    }
  }
  return (
    <UserPreferences.Provider value={{ iconSort, setIconSort }}>
      {children}
    </UserPreferences.Provider>
  );
}

export const useUserPreferences = () => useContext(UserPreferences);
