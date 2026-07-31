import { render, screen, fireEvent } from '@testing-library/react';
import { AddressSheet } from '../AddressSheet';

const fields = { cep: '', street: '', number: '', neighborhood: '', city: '', state: '', complement: '', latitude: '', longitude: '' };

test('salvar chama onSave', () => {
  const onSave = jest.fn();
  render(<AddressSheet open onClose={() => {}} fields={{ ...fields, street: 'Rua A', number: '1', neighborhood: 'C', city: 'Rio', state: 'RJ', cep: '20000-000' }} onField={() => {}} onCepBlur={() => {}} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button', { name: /salvar endereço/i }));
  expect(onSave).toHaveBeenCalled();
});

test('CEP no blur dispara onCepBlur', () => {
  const onCepBlur = jest.fn();
  render(<AddressSheet open onClose={() => {}} fields={fields} onField={() => {}} onCepBlur={onCepBlur} onSave={() => {}} />);
  fireEvent.blur(screen.getByLabelText(/CEP/i));
  expect(onCepBlur).toHaveBeenCalled();
});

test('sem campos obrigatórios o botão salvar fica desabilitado', () => {
  render(<AddressSheet open onClose={() => {}} fields={fields} onField={() => {}} onCepBlur={() => {}} onSave={() => {}} />);
  expect(screen.getByRole('button', { name: /salvar endereço/i })).toBeDisabled();
});

test('fechado não renderiza conteúdo', () => {
  render(<AddressSheet open={false} onClose={() => {}} fields={fields} onField={() => {}} onCepBlur={() => {}} onSave={() => {}} />);
  expect(screen.queryByLabelText(/CEP/i)).not.toBeInTheDocument();
});
