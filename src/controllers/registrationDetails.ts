import { type NextFunction, type Request, type Response, Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { registrationDetailsSchema } from '../schemas/registrationDetails';
import {
  RegistrationDetailsError,
  saveRegistrationDetails,
} from '../services/registrationDetails';

export function createRegistrationDetailsRouter(save = saveRegistrationDetails): Router {
  const router = Router();
  router.use(requireAuth);
  router.use((req, res, next) => {
    if (!req.session.registrationDetailsPending) {
      res.redirect('/home');
      return;
    }
    next();
  });

  const finishOnboarding = (req: Request, res: Response, next: NextFunction) => {
    delete req.session.registrationDetailsPending;
    req.session.save((error) => {
      if (error) return next(error);
      res.redirect(303, '/home');
    });
  };

  router.get('/', (_req, res) => {
    res.render('registration-details', { values: {} });
  });

  router.post('/skip', finishOnboarding);

  router.post('/', async (req, res, next) => {
    const input = registrationDetailsSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).render('registration-details', {
        values: req.body,
        error: 'Check the details below and try again.',
        errors: input.error.flatten().fieldErrors,
      });
      return;
    }
    if (!req.session.accountToken) {
      res.status(401).render('registration-details', {
        values: input.data,
        error: 'Please sign out and sign in again before saving your details.',
      });
      return;
    }

    try {
      await save(req.session.accountToken, input.data);
      finishOnboarding(req, res, next);
    } catch (error) {
      console.error('Saving registration details failed', error);
      const expired = error instanceof RegistrationDetailsError && error.status === 401;
      res.status(expired ? 401 : 503).render('registration-details', {
        values: input.data,
        error: expired
          ? 'Your sign-in has expired. Please sign out and sign in again before saving your details.'
          : 'We could not save your details. Please try again or skip for now.',
      });
    }
  });

  return router;
}
