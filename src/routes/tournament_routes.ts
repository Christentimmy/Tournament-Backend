import { Router } from 'express';
import { requireAdmin } from '../middlewares/admin_middleware';

import {
  createTournament,
  deleteTournament,
  getTournament,
  listTournaments,
  renameTournament,
  resetTournament,
  setSlot,
  setWinner,
} from '../controllers/tournment_controller';

const router = Router();

// Public (read-only)
router.get('/', listTournaments);
router.get('/:id', getTournament);

// Admin (write)
router.post('/', requireAdmin, createTournament);
router.patch('/:id', requireAdmin, renameTournament);
router.delete('/:id', requireAdmin, deleteTournament);
router.post('/:id/reset', requireAdmin, resetTournament);
router.put('/:id/matches/:matchId/winner', requireAdmin, setWinner);
router.put('/:id/matches/:matchId/slots/:slot', requireAdmin, setSlot);

export default router;