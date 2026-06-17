import axios from 'axios';
import { onlyDigits } from '../utils/documentValidation';
import logger from '../config/logger';

/**
 * Consulta CNPJ na BrasilAPI (gratuita, sem chave). Informativa: traz razão social
 * e situação cadastral para o admin avaliar. A aprovação continua manual.
 */
export async function consultarCNPJ(cnpj: string): Promise<{ razaoSocial?: string; situacao?: string } | null> {
  try {
    const c = onlyDigits(cnpj);
    const { data } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { timeout: 8000 });
    return {
      razaoSocial: data?.razao_social || data?.nome_fantasia,
      situacao: data?.descricao_situacao_cadastral,
    };
  } catch (err: any) {
    logger.warn('[cnpjLookup] Falha ao consultar BrasilAPI', { message: err?.message });
    return null; // não bloqueia o envio; admin decide manualmente
  }
}
