import { useEffect, useState } from 'react';
import api from '../lib/api';

interface StoreRatingsBlockProps {
  storeId: string;
}

export default function StoreRatingsBlock({ storeId }: StoreRatingsBlockProps) {
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    api.get(`/stores/${storeId}/ratings`).then(r => {
      setRatings(r.data);
      setLoading(false);
    });
  }, [storeId]);

  if (loading) return <div>Carregando avaliações da loja...</div>;

  if (ratings.length === 0) return <div>Nenhuma avaliação recebida ainda.</div>;

  return (
    <div style={{marginTop:32}}>
      <h2>Avaliações da Loja</h2>
      {ratings.map((av, idx) => (
        <div key={idx} style={{border:'1px solid #eee', borderRadius:8, padding:12, marginBottom:12}}>
          <div style={{fontSize:20}}>
            {[1,2,3,4,5].map(star => (
              <span key={star} style={{color: av.storeRating >= star ? '#FFD700' : '#ccc'}}>★</span>
            ))}
          </div>
          {av.storeComment && <div style={{marginTop:8}}>{av.storeComment}</div>}
          <div style={{marginTop:8, fontSize:12, color:'#888'}}>Data: {new Date(av.createdAt).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
