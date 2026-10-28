
import { Schema, model, HydratedDocument } from 'mongoose';

export interface ITournament {
  name: string;
  seeds: string[];                  // Round 1 slots in bracket order ("BYE" = empty slot)
  results: Map<string, string>;     // matchId -> winner name
  overrides: Map<string, string>;   // "matchId:slot" -> manually assigned player
  createdAt: Date;
  updatedAt: Date;
}

const tournamentSchema = new Schema<ITournament>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    seeds: { type: [String], required: true },
    results: { type: Map, of: String, default: {} },
    overrides: { type: Map, of: String, default: {} },
  },
  {
    timestamps: true,
    // Rejects a save if the document changed since it was loaded (VersionError -> 409),
    // so two admins can't silently overwrite each other.
    optimisticConcurrency: true,
  },
);

export type TournamentDoc = HydratedDocument<ITournament>;

export const Tournament = model<ITournament>('Tournament', tournamentSchema);