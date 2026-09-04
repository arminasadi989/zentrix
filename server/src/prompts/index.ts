import type { ModuleId, ResponseLength } from '../../../shared/modules.ts';
import type { MarketContextBlock } from '../../../shared/types.ts';
import { renderContextForPrompt } from '../services/marketContext.ts';
import { CRYPTO_FRAMEWORK } from './crypto.ts';
import { FOREX_FRAMEWORK } from './forex.ts';
import { GOLD_FRAMEWORK } from './gold.ts';
import { IR_CURRENCY_FRAMEWORK } from './irCurrency.ts';
import { lengthDirective } from './shared.ts';
import { TSE_FRAMEWORK } from './tse.ts';

/**
 * Static analytical framework per module. Declared as a Record over the union so
 * a new module cannot be added without its framework (Rule 1 + Rule 2).
 */
export const MODULE_FRAMEWORKS: Record<ModuleId, string> = {
  crypto: CRYPTO_FRAMEWORK,
  forex: FOREX_FRAMEWORK,
  'ir-currency': IR_CURRENCY_FRAMEWORK,
  gold: GOLD_FRAMEWORK,
  tse: TSE_FRAMEWORK,
};

/**
 * Composes the system instruction actually sent to Gemini:
 *   1. the module's static analytical framework,
 *   2. the freshly fetched live-data block with per-field provenance,
 *   3. the response-length directive derived from the user's selection.
 */
export function composeSystemInstruction(args: {
  moduleId: ModuleId;
  context: MarketContextBlock;
  responseLength: ResponseLength;
}): string {
  const framework = MODULE_FRAMEWORKS[args.moduleId];
  return [framework, renderContextForPrompt(args.context), lengthDirective(args.responseLength)].join('\n\n---\n\n');
}
