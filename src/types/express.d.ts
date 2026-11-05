import type { Identity, TokenClient } from '../clients/tokenClient';
import type { BrowserState } from '../middleware/browserState';
import type { CategoryChoice } from '../services/categories';

declare global {
  namespace Express {
    interface Request {
      auth?: Identity & { accessToken: string };
      tokenClient: TokenClient;
      browserState: BrowserState;
      browserStateSecret: string;
      productCategories?: CategoryChoice[];
    }
  }
}
