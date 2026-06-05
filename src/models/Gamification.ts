import { Schema, model, Document } from 'mongoose';


export type GamificationLevel = 'Bronze' | 'Prata' | 'Ouro' | 'Platina' | 'Diamante' | 'Lendário';

export interface IGamification extends Document {
  user_id: string;
  points: number; // Pontos disponíveis para resgate
  totalPoints: number; // Pontos acumulados para nível
  level: GamificationLevel;
  badges: string[];
  history: { date: string; action: string; points: number }[];
}

const GamificationSchema = new Schema<IGamification>({
  user_id: { type: String, required: true, unique: true },
  points: { type: Number, default: 0 }, // Pontos disponíveis
  totalPoints: { type: Number, default: 0 }, // Pontos acumulados
  level: { type: String, enum: ['Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Lendário'], default: 'Bronze' },
  badges: { type: [String], default: [] },
  history: [
    {
      date: { type: String },
      action: { type: String },
      points: { type: Number }
    }
  ]
});

export default model<IGamification>('Gamification', GamificationSchema);
