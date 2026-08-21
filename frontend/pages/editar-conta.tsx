import MeusDadosForm from '../components/MeusDadosForm';

// Mantida por compatibilidade (vários fluxos linkam pra cá). O conteúdo agora é
// o componente reutilizável MeusDadosForm, também embutido em /user-profile.
export default function EditarContaPage() {
  return (
    <div style={wrap}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-strong)', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 20px' }}>
          Editar meus dados
        </h1>
        <MeusDadosForm />
      </div>
    </div>
  );
}

// Formulário: coluna legível centralizada (campos largos são ruins de usar).
const wrap: React.CSSProperties = { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', justifyContent: 'center', padding: 'var(--space-6) var(--space-4) 80px' };
