import { useContext, useEffect, useState } from 'react';
import api from '../lib/api';
import SocketContext from '../contexts/SocketContext';

/**
 * Número de notificações não lidas, com a mesma fonte e os mesmos eventos do `useNotifications`
 * da Nav (GET /notifications + `notification:received` / `notification:read`).
 * Não exige SocketProvider (sem ele, só a leitura inicial) e falha em silêncio: o sino fica sem número.
 */
export function useUnreadNotifications(): number {
  const socket = useContext(SocketContext);
  const on = socket?.on;
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    api.get('/notifications')
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : res?.data?.notifications;
        if (alive) setCount(Array.isArray(list) ? list.filter((n: any) => !n?.read).length : 0);
      })
      .catch(() => { if (alive) setCount(0); });
    if (!on) return () => { alive = false; };
    const offReceived = on('notification:received', (n: any) => { if (!n?.read) setCount((c) => c + 1); });
    const offRead = on('notification:read', () => setCount((c) => Math.max(0, c - 1)));
    return () => { alive = false; offReceived(); offRead(); };
  }, [on]);

  return count;
}

export default useUnreadNotifications;
