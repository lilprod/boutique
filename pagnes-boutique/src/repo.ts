import type { DB } from './types';

/**
 * Couche d'accès aux données. Toute l'application passe par cette interface :
 * pour brancher une API, il suffit d'écrire une autre implémentation de `Repository`.
 */
export interface Repository {
  load(): DB | null;
  save(db: DB): void;
  loadSession(): string | null;
  saveSession(userId: string | null): void;
}

const KEY = 'pagnes.db.v1';
const SESSION = 'pagnes.session.v1';

export const localRepo: Repository = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as DB) : null;
    } catch { return null; }
  },
  save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* stockage plein ou indisponible */ }
  },
  loadSession() {
    try { return localStorage.getItem(SESSION); } catch { return null; }
  },
  saveSession(id) {
    try { id ? localStorage.setItem(SESSION, id) : localStorage.removeItem(SESSION); } catch { /* ignoré */ }
  },
};
