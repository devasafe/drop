import type { MoneyTone } from '../../lib/motoboyMoney';
import type { StageTone } from '../../lib/sellerOrders';
import blocks from '../panel/PanelBlocks.module.css';

const BY_MONEY: Record<MoneyTone, string> = { ok: blocks.tagOk, warn: blocks.tagWarn, err: blocks.tagErr, info: blocks.tagInfo, neutral: '' };
const BY_STAGE: Record<StageTone, string> = { success: blocks.tagOk, warning: blocks.tagWarn, danger: blocks.tagErr, info: blocks.tagInfo, brand: blocks.tagBrand, neutral: '' };

/** Classe do selo de dinheiro (blocos de painel; neutro = só a base). */
export const moneyTagClass = (tone: MoneyTone): string => [blocks.tag, BY_MONEY[tone]].filter(Boolean).join(' ');
/** Classe do selo a partir do tom de `withdrawalView` (moneyLabels da D1). */
export const stageTagClass = (tone: StageTone): string => [blocks.tag, BY_STAGE[tone]].filter(Boolean).join(' ');
