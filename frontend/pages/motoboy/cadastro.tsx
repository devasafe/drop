import { CadastroScreen } from '../../components/motoboy/cadastro/CadastroScreen';

/**
 * Cadastro do entregador (D2): conta, verificação, recebimento e análise numa rota só.
 * Pública na etapa 1 (sem ProtectedRoute); as outras exigem a conta de motoboy, conferida na tela.
 * As URLs antigas do cadastro redirecionam para cá (lib/redirects.js).
 */
export default function MotoboyCadastro() {
  return <CadastroScreen />;
}
