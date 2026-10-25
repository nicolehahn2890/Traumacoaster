/**
 * Coin-Gruppen (Plan 4.4, 8a.1): Form-Hinweise, aus denen das Spiel einzelne Coins macht: Reihe (waagerecht), Bogen
 * (Halbbogen nach oben), Ring (Kreis) und Säule (senkrecht). Die Gruppe steht in der Zonendatei mit Anker, Form, Zahl und
 * Abstand; die Coins liegen auf der Spur der Gruppe und zählen wie heute über den Fangradius.
 */
export type CoinShape = 'row' | 'arc' | 'ring' | 'column';
export const COIN_SHAPES: readonly CoinShape[] = ['row', 'arc', 'ring', 'column'];

export interface ZoneCoinGroup {
  id: string;
  shape: CoinShape;
  /** Anker: Mitte der Reihe bzw. Fußpunkt von Bogen, Ring und Säule (Meter, Höhe über dem Boden), Tiefe in Spuren */
  x: number;
  y: number;
  z: number;
  count: number;
  /** Abstand der Coins (Meter); beim Ring und Bogen der Radius */
  spacing: number;
}

export interface CoinPoint {
  x: number;
  y: number;
  lane: number;
}

export function coinsOfGroup(g: ZoneCoinGroup): CoinPoint[] {
  const n = Math.max(1, Math.min(40, Math.round(g.count)));
  const s = Math.max(0.5, g.spacing);
  const out: CoinPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    switch (g.shape) {
      case 'arc':
        out.push({ x: g.x + (t - 0.5) * 2 * s, y: g.y + s * Math.sin(Math.PI * t), lane: g.z });
        break;
      case 'ring': {
        const a = (i / n) * Math.PI * 2;
        out.push({ x: g.x + Math.cos(a) * s, y: g.y + s + Math.sin(a) * s, lane: g.z });
        break;
      }
      case 'column':
        out.push({ x: g.x, y: g.y + i * s, lane: g.z });
        break;
      default:
        out.push({ x: g.x + (i - (n - 1) / 2) * s, y: g.y, lane: g.z });
    }
  }
  return out.map((c) => ({ x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100, lane: c.lane }));
}
