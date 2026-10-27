import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PushTestButton } from '../components/drop/PushTestButton';
import { cssViolations } from './helpers/dsTokens';

test('testar com o app fechado: pede o aviso em 10 s e diz para fechar o app', async () => {
  const sendTest = jest.fn(async () => undefined);
  render(<PushTestButton sendTest={sendTest} />);
  fireEvent.click(screen.getByRole('button', { name: 'Testar com o app fechado' }));
  await waitFor(() => expect(sendTest).toHaveBeenCalledWith(10));
  expect(screen.getByRole('status')).toHaveTextContent('Feche o app ou bloqueie a tela agora');
  expect(screen.getByRole('button', { name: 'Testar com o app fechado' })).toBeDisabled();
});

test('CSS só com tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'components/drop/PushTestButton.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
});
