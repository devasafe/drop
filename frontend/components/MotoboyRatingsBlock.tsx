import { useEffect, useState } from 'react';
import api from '../lib/api';

interface MotoboyRatingsBlockProps {
  motoboyId: string;
}

export default function MotoboyRatingsBlock({ motoboyId }: MotoboyRatingsBlockProps) {
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!motoboyId) return;
    api.get(`/deliveries/motoboy/${motoboyId}/ratings`).then(r => {
      setRatings(r.data);
      setLoading(false);
    });
  }, [motoboyId]);

  if (loading) return <div>Carregando avaliações...</div>;

  if (ratings.length === 0) return <div>Nenhuma avaliação recebida ainda.</div>;

  return (
    <div style={{marginTop:32}}>
      <h2>Avaliações Recebidas</h2>
      {ratings.map((av, idx) => (
        <div key={idx} style={{border:'1px solid #eee', borderRadius:8, padding:12, marginBottom:12}}>
          <div style={{fontSize:20}}>
            {[1,2,3,4,5].map(star => (
              <span key={star} style={{color: av.rating >= star ? '#FFD700' : '#ccc'}}>★</span>
            ))}
          </div>
          {av.comment && <div style={{marginTop:8}}>{av.comment}</div>}
          <div style={{marginTop:8, fontSize:12, color:'#888'}}>Data: {new Date(av.createdAt).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
