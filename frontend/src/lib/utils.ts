/** Shared frontend utilities */
export function genUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function hashColor(str: string): string {
  const colors = ['#f97316','#8b5cf6','#06b6d4','#ec4899','#10b981','#f59e0b','#6366f1','#ef4444','#14b8a6','#a855f7'];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

export default { genUuid, hashColor };
