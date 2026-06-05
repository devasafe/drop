// DEBUG: Mostra exatamente qual URL está sendo usada
import api from '../lib/api';

export default function DebugPage() {
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', fontSize: '14px' }}>
      <h1>DEBUG - API URL Detection</h1>
      
      <h2>Current State:</h2>
      <pre style={{ background: '#f0f0f0', padding: '10px', borderRadius: '5px' }}>
{`
Window Info:
- Hostname: ${typeof window !== 'undefined' ? window.location.hostname : 'SSR'}
- Origin: ${typeof window !== 'undefined' ? window.location.origin : 'SSR'}
- Href: ${typeof window !== 'undefined' ? window.location.href : 'SSR'}

API Instance:
- Base URL: ${api.defaults.baseURL}

Environment:
- NODE_ENV: ${process.env.NODE_ENV}
- NEXT_PUBLIC_API_URL: ${process.env.NEXT_PUBLIC_API_URL || 'NOT SET'}
`}
      </pre>

      <h2>Expected URLs:</h2>
      <ul>
        <li><strong>Localhost (dev):</strong> http://localhost:4000/api</li>
        <li><strong>Vercel (prod):</strong> https://xdxrxoxpx.onrender.com/api</li>
      </ul>

      <h2>Test API Connection:</h2>
      <button 
        onClick={async () => {
          try {
            const res = await fetch(api.defaults.baseURL + '/products');
            const data = await res.json();
            alert(`Success!\nStatus: ${res.status}\nProducts: ${data.products?.length || 0}`);
          } catch (err: any) {
            alert(`Error:\n${err.message}`);
          }
        }}
        style={{ padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}
      >
        Test API Connection
      </button>
    </div>
  );
}
