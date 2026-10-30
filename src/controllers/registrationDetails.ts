import { type NextFunction, type Request, type Response, Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { registrationDetailsSchema } from '../schemas/registrationDetails';
import {
  RegistrationDetailsError,
  getSecurityQuestions,
  saveRegistrationDetails,
} from '../services/registrationDetails';

export function createRegistrationDetailsRouter(
  save = saveRegistrationDetails,
  loadQuestions = getSecurityQuestions,
): Router {
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

  const renderDetails = async (
    req: Request,
    res: Response,
    status: number,
    context: Record<string, unknown>,
  ) => {
    if (!req.session.accountToken) {
      res.status(401).render('registration-details', {
        ...context,
        questionsUnavailable: true,
        error: 'Please sign out and sign in again before entering your details.',
      });
      return;
    }
    try {
      const questions = await loadQuestions(req.session.accountToken);
      res.status(status).render('registration-details', { ...context, questions });
    } catch (error) {
      console.error('Loading security questions failed', error);
      const expired = error instanceof RegistrationDetailsError && error.status === 401;
      res.status(expired ? 401 : 503).render('registration-details', {
        ...context,
        questionsUnavailable: true,
        error: expired
          ? 'Your sign-in has expired. Please sign out and sign in again.'
          : 'We could not load the security questions. Please try again or skip for now.',
      });
    }
  };

  router.get('/', async (req, res) => {
    await renderDetails(req, res, 200, { values: {} });
  });

  router.post('/skip', finishOnboarding);

  router.post('/', async (req, res, next) => {
    const input = registrationDetailsSchema.safeParse(req.body);
    if (!input.success) {
      await renderDetails(req, res, 400, {
        values: req.body,
        error: 'Check the details below and try again.',
        errors: input.error.flatten().fieldErrors,
      });
      return;
    }
    if (!req.session.accountToken) {
      await renderDetails(req, res, 401, {
        values: input.data,
        error: 'Please sign out and sign in again before saving your details.',
      });
      return;
    }

    try {
      const { securityQuestionID, securityAnswer, ...profile } = input.data;
      const details = securityQuestionID && securityAnswer
        ? { ...profile, securityQuestionID, securityAnswer }
        : profile;
      await save(req.session.accountToken, details);
      finishOnboarding(req, res, next);
    } catch (error) {
      console.error('Saving registration details failed', error);
      const expired = error instanceof RegistrationDetailsError && error.status === 401;
      const invalid = error instanceof RegistrationDetailsError && error.status === 400;
      await renderDetails(req, res, expired ? 401 : invalid ? 400 : 503, {
        values: input.data,
        error: expired
          ? 'Your sign-in has expired. Please sign out and sign in again before saving your details.'
          : invalid
            ? 'Check your security question and re-enter your answer, then try again.'
            : 'We could not save your details. Please try again or skip for now.',
      });
    }
  });

  return router;
}
