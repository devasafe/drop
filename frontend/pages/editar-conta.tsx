import MeusDadosForm from '../components/MeusDadosForm';

// Mantida por compatibilidade (vários fluxos linkam pra cá). O conteúdo agora é
// o componente reutilizável MeusDadosForm, também embutido em /user-profile.
export default function EditarContaPage() {
  return (
    <div style={wrap}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Editar meus dados</h1>
        <MeusDadosForm />
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0A0A0A', color: 'rgba(255,255,255,0.92)', display: 'flex', justifyContent: 'center', padding: 24 };
