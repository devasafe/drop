import { randomInt } from 'crypto';
import { prisma } from '../lib/prisma';

/**
 * Trava de força bruta dos PINs da entrega (retirada, entrega, devolução).
 * PIN de 5 dígitos = 100 mil combinações; sem limite, um script acertava em minutos.
 * A cada PIN_MAX_ATTEMPTS erros a entrega fica PIN_LOCK_MINUTES sem aceitar PIN.
 */
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;

/** PIN numérico de `digits` dígitos com gerador criptográfico (não Math.random). */
export function generatePin(digits = 5): string {
  return String(randomInt(10 ** (digits - 1), 10 ** digits));
}

/** Minutos restantes de trava (0 = liberado). */
export function pinLockMinutesLeft(delivery: { pinLockedUntil?: Date | string | null }): number {
  if (!delivery?.pinLockedUntil) return 0;
  const ms = new Date(delivery.pinLockedUntil).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/** Registra um erro; ao atingir o limite, trava e zera o contador. */
export async function registerPinFailure(deliveryId: string): Promise<void> {
  const d = await prisma.delivery.update({
    where: { id: deliveryId },
    data: { pinFailedAttempts: { increment: 1 } },
    select: { pinFailedAttempts: true },
  });
  if (d.pinFailedAttempts >= PIN_MAX_ATTEMPTS) {
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { pinFailedAttempts: 0, pinLockedUntil: new Date(Date.now() + PIN_LOCK_MINUTES * 60000) },
    });
  }
}

export const pinLockedResponse = (minutes: number) => ({
  error: `Muitas tentativas de PIN. Tente novamente em ${minutes} min.`,
  code: 'PIN_LOCKED',
});
