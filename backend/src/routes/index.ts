import { Router } from 'express';
import serviceRoutes from './services/services.routes';

const router = Router();
router.use('/services', serviceRoutes);

export default router;
