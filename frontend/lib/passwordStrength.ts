export interface PasswordStrength { score: 0 | 1 | 2 | 3 | 4; label: string; ok: boolean }

const QUALITY = ['Fraca', 'Fraca', 'Ok', 'Boa', 'Forte'] as const;

/** Força da senha enquanto digita. `ok` é a regra do backend (8+ caracteres). */
export function passwordStrength(pw: string): PasswordStrength {
  const hasNumber = /\d/.test(pw);
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 8 && hasNumber) score++;
  if (pw.length >= 10 && hasNumber) score++;
  if (pw.length >= 10 && ((/[a-z]/.test(pw) && /[A-Z]/.test(pw)) || /[^A-Za-z0-9]/.test(pw))) score++;
  const s = Math.min(4, score) as PasswordStrength['score'];
  return { score: s, label: `${QUALITY[s]}: ${pw.length} caracteres${hasNumber ? ' com número' : ''}`, ok: pw.length >= 8 };
}
