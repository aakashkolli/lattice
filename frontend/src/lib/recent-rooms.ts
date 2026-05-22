export interface RecentRoom {
  id: string;
  title: string;
  visitedAt: number;
}

export function saveRecentRoom(id: string, title: string = ''): void {
  try {
    const raw = localStorage.getItem('lattice_recent_rooms');
    const rooms: RecentRoom[] = raw ? JSON.parse(raw) : [];
    const filtered = rooms.filter((r) => r.id !== id);
    filtered.unshift({ id, title, visitedAt: Date.now() });
    localStorage.setItem('lattice_recent_rooms', JSON.stringify(filtered.slice(0, 5)));
  } catch {}
}

export function loadRecentRooms(): RecentRoom[] {
  try {
    const raw = localStorage.getItem('lattice_recent_rooms');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
