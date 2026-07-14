import { Router } from 'express';
import * as controller from './household.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createHouseholdValidation, joinHouseholdValidation } from './household.validation';

const router = Router();

router.use(authenticate);

router.get('/mine', controller.getMine);
router.get('/overview', controller.getOverview);
router.post('/', createHouseholdValidation, validate, controller.create);
router.post('/join', joinHouseholdValidation, validate, controller.join);
router.post('/:id/invites', controller.createInvite);
router.delete('/:id/members/:userId', controller.removeMember);
router.post('/leave', controller.leave);
router.delete('/mine', controller.remove);

export default router;
