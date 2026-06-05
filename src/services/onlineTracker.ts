/**
 * Online Tracker
 *
 * Singleton in-memory store com todos os usuários conectados via Socket.io.
 * Usado pelo analyticsController para expor:
 *   - contagem agregada por role (cliente / lojista / motoboy / admin)
 *   - lista de pontos geo para o mapa ao vivo do painel do CEO
 *
 * O estado vive só em memória — o objetivo é ter uma visão em tempo real,
 * não persistência. Em restart do servidor a lista zera e é recomposta
 * conforme os clientes reconectam.
 */

export type PresenceRole =
  | 'cliente'
  | 'lojista'
  | 'motoboy'
  | 'ceo'
  | 'marketing'
  | 'gerente_geral'
  | 'gerente_clientes'
  | 'gerente_lojistas'
  | 'gerente_motoboys'
  | string;

export interface Presence {
  userId: string;
  role: PresenceRole;
  socketId: string;
  lat?: number;
  lng?: number;
  lastSeen: number; // epoch ms
}

export interface PresenceSnapshot {
  total: number;
  byRole: Record<string, number>;
  points: Array<{
    userId: string;
    role: string;
    lat: number;
    lng: number;
  }>;
}

class OnlineTracker {
  private users: Map<string, Presence> = new Map();

  set(userId: string, data: Omit<Presence, 'userId' | 'lastSeen'> & { lastSeen?: number }) {
    this.users.set(userId, {
      userId,
      ...data,
      lastSeen: data.lastSeen ?? Date.now(),
    });
  }

  updateLocation(userId: string, lat: number, lng: number) {
    const current = this.users.get(userId);
    if (!current) return;
    current.lat = lat;
    current.lng = lng;
    current.lastSeen = Date.now();
  }

  touch(userId: string) {
    const current = this.users.get(userId);
    if (current) current.lastSeen = Date.now();
  }

  remove(userId: string) {
    this.users.delete(userId);
  }

  get(userId: string): Presence | undefined {
    return this.users.get(userId);
  }

  getAll(): Presence[] {
    return Array.from(this.users.values());
  }

  snapshot(): PresenceSnapshot {
    const all = this.getAll();
    const byRole: Record<string, number> = {};
    const points: PresenceSnapshot['points'] = [];

    for (const p of all) {
      byRole[p.role] = (byRole[p.role] || 0) + 1;
      if (p.lat != null && p.lng != null) {
        points.push({ userId: p.userId, role: p.role, lat: p.lat, lng: p.lng });
      }
    }

    return { total: all.length, byRole, points };
  }

  count(): number {
    return this.users.size;
  }

  clear() {
    this.users.clear();
  }
}

export const onlineTracker = new OnlineTracker();
export default onlineTracker;
