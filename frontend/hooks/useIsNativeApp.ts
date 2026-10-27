import { useEffect, useState } from 'react';
import { isNativeApp } from '../lib/native';

/** `isNativeApp()` para render: falso no servidor e no 1º render, sem divergir na hidratação. */
export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  return native;
}
