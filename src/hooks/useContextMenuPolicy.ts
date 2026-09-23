import { useEffect } from 'react';

export function useContextMenuPolicy() {
  useEffect(() => {
    // Cancel the browser menu without stopping application menu/pan handlers.
    // Capture also covers controls and Ant popups rendered outside the app root.
    const preventNativeMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener('contextmenu', preventNativeMenu, true);
    return () => document.removeEventListener('contextmenu', preventNativeMenu, true);
  }, []);
}
