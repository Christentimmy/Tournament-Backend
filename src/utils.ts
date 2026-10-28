export const BYE = 'BYE';

export type SlotSource =
  | { type: 'seed'; index: number }
  | { type: 'winner'; from: string };

export interface MatchDef {
  id: string;
  round: string;
  roundNo: number;
  sources: [SlotSource, SlotSource];
}

export interface ResolvedMatch extends MatchDef {
  p1: string | null; // null = TBD
  p2: string | null;
  manual: [boolean, boolean];
  winner: string | null;
  auto: boolean; // decided automatically because of a BYE
}

const PLAYERS = [
  'Fatih Yılmaz', 'Abdullah', 'Nuri', 'Ali Can', 'Mehmet D.', 'Yasemin',
  'Zeki', 'Ali Salman', 'Bilgin', 'Timur', 'Mikail', 'Fatih Keskin',
  'Eymen', 'Sami', 'Hüseyin Avcı', 'Muhammed', 'Veysel', 'Erdal',
  'Hüseyin Baki', 'Mehmet Yurttaş', 'Yasin', 'Cem',
];

export const DEFAULT_SEEDS: string[] = [
  BYE, BYE, BYE, BYE, ...PLAYERS, BYE, BYE, BYE, BYE, BYE, BYE,
];

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export function validateSeeds(seeds: unknown): string | null {
  if (!Array.isArray(seeds)) return 'seeds must be an array';
  const n = seeds.length;
  if (n < 4 || n > 128 || (n & (n - 1)) !== 0) {
    return 'seeds length must be a power of two between 4 and 128 (use BYE for empty slots)';
  }
  const seen = new Set<string>();
  let players = 0;
  for (const s of seeds) {
    if (typeof s !== 'string' || !s.trim() || s.trim().length > 60) {
      return 'every seed must be a non-empty string up to 60 characters';
    }
    if (s === BYE) continue;
    const key = s.trim().toLocaleLowerCase('tr');
    if (seen.has(key)) return `duplicate player: ${s}`;
    seen.add(key);
    players++;
  }
  if (players < 2) return 'at least 2 players are required';
  return null;
}

/* ------------------------------------------------------------------ */
/* Structure: single elimination                                       */
/* Ids keep the old "W{round}-{n}" format so results already stored    */
/* for the first rounds stay valid. The LAST match is the final.       */
/* ------------------------------------------------------------------ */

export function buildStructure(size: number): MatchDef[] {
  const defs: MatchDef[] = [];
  const rounds = Math.log2(size);
  const ids: string[][] = [];

  const roundName = (r: number) =>
    r === rounds ? 'Final'
    : r === rounds - 1 ? 'Semifinals'
    : r === rounds - 2 ? 'Quarterfinals'
    : `Round ${r}`;

  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    const roundIds: string[] = [];
    for (let i = 1; i <= count; i++) {
      const id = `W${r}-${i}`;
      roundIds.push(id);
      const sources: [SlotSource, SlotSource] =
        r === 1
          ? [{ type: 'seed', index: (i - 1) * 2 }, { type: 'seed', index: (i - 1) * 2 + 1 }]
          : [
              { type: 'winner', from: ids[r - 2][(i - 1) * 2] },
              { type: 'winner', from: ids[r - 2][(i - 1) * 2 + 1] },
            ];
      defs.push({ id, round: roundName(r), roundNo: r, sources });
    }
    ids.push(roundIds);
  }

  return defs;
}

/* ------------------------------------------------------------------ */
/* Resolver: every slot is derived from seeds + results + overrides    */
/* ------------------------------------------------------------------ */

export function resolveBracket(
  defs: MatchDef[],
  seeds: string[],
  results: Record<string, string>,
  overrides: Record<string, string>,
): ResolvedMatch[] {
  const byId = new Map<string, ResolvedMatch>();

  for (const d of defs) {
    const slots = d.sources.map((src, s) => {
      const override = overrides[`${d.id}:${s}`];
      if (override) return { name: override as string | null, manual: true };
      if (src.type === 'seed') return { name: (seeds[src.index] ?? BYE) as string | null, manual: false };
      return { name: byId.get(src.from)!.winner, manual: false };
    });

    const p1 = slots[0].name;
    const p2 = slots[1].name;
    let winner: string | null = null;
    let auto = false;

    if (p1 === BYE && p2 === BYE) { winner = BYE; auto = true; }
    else if (p1 === BYE && p2) { winner = p2; auto = true; }
    else if (p2 === BYE && p1) { winner = p1; auto = true; }
    else if (p1 && p2) {
      const r = results[d.id];
      // A stored result only counts while that player is still in this match
      if (r === p1 || r === p2) winner = r;
    }

    byId.set(d.id, { ...d, p1, p2, manual: [slots[0].manual, slots[1].manual], winner, auto });
  }

  return defs.map((d) => byId.get(d.id)!);
}

export const isPlayable = (m: ResolvedMatch) =>
  !!m.p1 && !!m.p2 && m.p1 !== BYE && m.p2 !== BYE;