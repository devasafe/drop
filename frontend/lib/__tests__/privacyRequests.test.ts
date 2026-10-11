import { privacyMailto } from '../privacyRequests';
import { PRIVACY_EMAIL } from '../legalDocs';

it('e-mail do encarregado com o direito e a conta no assunto', () => {
  const href = privacyMailto('eliminacao', 'ana@email.com');
  expect(href.startsWith(`mailto:${PRIVACY_EMAIL}?subject=`)).toBe(true);
  expect(decodeURIComponent(href)).toContain('Exclusão da conta — ana@email.com');
  expect(decodeURIComponent(href)).toContain('Conta: ana@email.com');
});
