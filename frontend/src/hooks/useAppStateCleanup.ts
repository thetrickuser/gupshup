import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export default function useAppStateCleanup(onBackground: () => void) {
  useEffect(() => {
    const handler = (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        onBackground();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [onBackground]);
}
