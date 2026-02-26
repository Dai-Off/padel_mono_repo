import { Request, Response, Router } from 'express';

export type ZoneTrends = {
  popularTimeSlot: string | null;
  topClub: string | null;
  activePlayersToday: number | null;
  nextTournament: string | null;
};

const router = Router();

// GET /home/zone-trends - tendencias en la zona del usuario (datos opcionales)
router.get('/zone-trends', async (_req: Request, res: Response) => {
  try {
    // TODO: agregar lógica real desde bookings, clubs, players según zona
    const trends: ZoneTrends = {
      popularTimeSlot: null,
      topClub: null,
      activePlayersToday: null,
      nextTournament: null,
    };
    return res.json(trends);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

export default router;
