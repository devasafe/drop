import { render, screen, fireEvent } from '@testing-library/react';
import { ChatComposer } from '../ChatComposer';

test('Enter e clique em Enviar disparam onSend', () => {
  const onSend = jest.fn();
  render(<ChatComposer value="oi" onChange={() => {}} onSend={onSend} />);
  fireEvent.keyDown(screen.getByPlaceholderText(/mensagem/i), { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
  expect(onSend).toHaveBeenCalledTimes(2);
});

test('onChange reflete digitação', () => {
  const onChange = jest.fn();
  render(<ChatComposer value="" onChange={onChange} onSend={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText(/mensagem/i), { target: { value: 'a' } });
  expect(onChange).toHaveBeenCalledWith('a');
});
