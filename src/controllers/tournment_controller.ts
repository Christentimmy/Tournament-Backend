import { Request, Response, RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import { Tournament, TournamentDoc } from '../models/tournament_model';
import {
  BYE,
  DEFAULT_SEEDS,
  ResolvedMatch,
  buildStructure,
  isPlayable,
  resolveBracket,
  validateSeeds,
} from '../utils';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// Forwards rejected promises to the error middleware (works on Express 4 and 5)
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

const resolve = (t: TournamentDoc): ResolvedMatch[] =>
  resolveBracket(
    buildStructure(t.seeds.length),
    t.seeds,
    Object.fromEntries(t.results),
    Object.fromEntries(t.overrides),
  );

const roster = (t: TournamentDoc) =>
  Array.from(new Set(t.seeds.filter((s) => s !== BYE))).sort((a, b) => a.localeCompare(b, 'tr'));

// The last match of a single-elimination bracket is the final
const finalWinner = (matches: ResolvedMatch[]) => {
  const w = matches[matches.length - 1]?.winner ?? null;
  return w && w !== BYE ? w : null;
};

const view = (t: TournamentDoc) => {
  const matches = resolve(t);
  return {
    id: t._id,
    name: t.name,
    seeds: t.seeds,
    players: roster(t),
    matches,
    champion: finalWinner(matches),
    version: t.__v,
    updatedAt: t.updatedAt,
  };
};

/**
 * Keeps stored data consistent: drops any saved result that is no longer valid
 * (e.g. the winner was changed upstream so that player isn't in the match anymore,
 * or the match is now an automatic BYE). Call before every save.
 */
function pruneResults(t: TournamentDoc) {
  const byId = new Map(resolve(t).map((m) => [m.id, m]));

  for (const id of Array.from(t.results.keys())) {
    const m = byId.get(id);
    if (!m || m.auto || m.winner !== t.results.get(id)) t.results.delete(id);
  }

  // Also drop manual assignments that point to matches that no longer exist
  // (e.g. losers-bracket matches from the old double-elimination format)
  for (const key of Array.from(t.overrides.keys())) {
    if (!byId.has(key.slice(0, key.lastIndexOf(':')))) t.overrides.delete(key);
  }
}

async function load(req: Request, res: Response): Promise<TournamentDoc | null> {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400).json({ message: 'Invalid tournament id' });
    return null;
  }
  const t = await Tournament.findById(id);
  if (!t) {
    res.status(404).json({ message: 'Tournament not found' });
    return null;
  }
  return t;
}

/* ------------------------------------------------------------------ */
/* Tournament CRUD                                                     */
/* ------------------------------------------------------------------ */

export const createTournament = wrap(async (req, res) => {
  const name = typeof req.body?.name === 'string' && req.body.name.trim()
    ? req.body.name.trim()
    : '8-Ball Pool Championship 2026';
  const seeds = req.body?.seeds ?? DEFAULT_SEEDS;

  const error = validateSeeds(seeds);
  if (error) return res.status(400).json({ message: error });

  const t = await Tournament.create({ name, seeds: (seeds as string[]).map((s) => s.trim()) });
  res.status(201).json(view(t));
});

export const listTournaments = wrap(async (_req, res) => {
  const list = await Tournament.find().sort({ createdAt: -1 }).select('name createdAt updatedAt');
  res.json(list);
});

export const getTournament = wrap(async (req, res) => {
  const t = await load(req, res);
  if (!t) return;
  res.json(view(t));
});

export const renameTournament = wrap(async (req, res) => {
  const t = await load(req, res);
  if (!t) return;
  const name = req.body?.name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    return res.status(400).json({ message: 'name must be a non-empty string up to 120 characters' });
  }
  t.name = name.trim();
  await t.save();
  res.json(view(t));
});

export const deleteTournament = wrap(async (req, res) => {
  const t = await load(req, res);
  if (!t) return;
  await t.deleteOne();
  res.status(204).end();
});

export const resetTournament = wrap(async (req, res) => {
  const t = await load(req, res);
  if (!t) return;
  t.results.clear();
  t.overrides.clear();
  await t.save();
  res.json(view(t));
});

/* ------------------------------------------------------------------ */
/* Match actions                                                       */
/* ------------------------------------------------------------------ */

// PUT /:id/matches/:matchId/winner   body: { "winner": "Name" | null }
export const setWinner = wrap(async (req, res) => {
  const t = await load(req, res);
  if (!t) return;

  const { matchId } = req.params;
  const winner: unknown = req.body?.winner;
  const match = resolve(t).find((m) => m.id === matchId);
  if (!match) return res.status(404).json({ message: 'Match not found' });

  if (winner === null || winner === undefined) {
    t.results.delete(matchId as string); // clear / undo
  } else {
    if (typeof winner !== 'string') return res.status(400).json({ message: 'winner must be a string or null' });
    if (match.auto) return res.status(409).json({ message: 'This match is decided automatically (BYE)' });
    if (!isPlayable(match)) return res.status(409).json({ message: 'Both players must be known before declaring a winner' });
    if (winner !== match.p1 && winner !== match.p2) {
      return res.status(400).json({ message: 'winner must be one of the two players in this match' });
    }
    t.results.set(matchId as string, winner);
  }

  pruneResults(t); // removes downstream results that are now invalid
  await t.save();
  res.json(view(t));
});

// PUT /:id/matches/:matchId/slots/:slot   body: { "player": "Name" | null }  (slot = 0 or 1)
export const setSlot = wrap(async (req, res) => {
  const t = await load(req, res);
  if (!t) return;

  const { matchId } = req.params;
  const slot = Number(req.params.slot);
  const player: unknown = req.body?.player;

  if (slot !== 0 && slot !== 1) return res.status(400).json({ message: 'slot must be 0 or 1' });
  if (!resolve(t).some((m) => m.id === matchId)) return res.status(404).json({ message: 'Match not found' });

  const key = `${matchId}:${slot}`;
  if (player === null || player === undefined || player === '') {
    t.overrides.delete(key); // back to automatic
  } else {
    if (typeof player !== 'string' || !roster(t).includes(player)) {
      return res.status(400).json({ message: 'player must be someone in the tournament roster' });
    }
    t.overrides.set(key, player);
  }

  pruneResults(t);
  await t.save();
  res.json(view(t));
});