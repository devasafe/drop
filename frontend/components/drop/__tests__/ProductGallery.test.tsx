/** Fotos do produto: arrastar troca a foto (bolinhas e miniaturas acompanham) e tocar abre a tela cheia. */
import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ProductGallery, VIEWER_HISTORY_KEY } from '../ProductGallery';
import { cssViolations } from '../../../__tests__/helpers/dsTokens';

const WIDTH = 400;
const fotos = ['https://img/a.jpg', 'https://img/b.jpg', 'https://img/c.jpg'];

/** jsdom não faz layout: dá largura às faixas e faz scrollTo mover a rolagem. */
function layout(track: HTMLElement) {
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: WIDTH });
  (track as any).scrollTo = jest.fn(({ left }) => { track.scrollLeft = left; fireEvent.scroll(track); });
  return track;
}
const heroTrack = () => layout(screen.getByRole('button', { name: 'Abrir foto 1 de 3 de Tênis' }).parentElement as HTMLElement);
const swipeTo = (track: HTMLElement, idx: number) => { track.scrollLeft = idx * WIDTH; fireEvent.scroll(track); };
const thumb = (n: number) => screen.getByRole('button', { name: `Ver foto ${n} de Tênis` });

afterEach(() => {
  // Volta o histórico do jsdom a um estado limpo entre os testes.
  window.history.replaceState(null, '');
  document.body.style.overflow = '';
});

test('arrastar para o lado troca a foto, e a miniatura acompanha', () => {
  render(<ProductGallery images={fotos} name="Tênis" />);
  const track = heroTrack();
  expect(thumb(1)).toHaveAttribute('aria-pressed', 'true');
  swipeTo(track, 2);
  expect(thumb(3)).toHaveAttribute('aria-pressed', 'true');
  expect(thumb(1)).toHaveAttribute('aria-pressed', 'false');
});

test('tocar na miniatura rola a foto grande até ela', () => {
  render(<ProductGallery images={fotos} name="Tênis" />);
  const track = heroTrack();
  fireEvent.click(thumb(2));
  expect((track as any).scrollTo).toHaveBeenLastCalledWith({ left: WIDTH, behavior: 'smooth' });
  expect(thumb(2)).toHaveAttribute('aria-pressed', 'true');
});

test('tocar na foto abre a tela cheia na foto tocada', () => {
  render(<ProductGallery images={fotos} name="Tênis" />);
  swipeTo(heroTrack(), 1);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir foto 2 de 3 de Tênis' }));
  const dialog = screen.getByRole('dialog', { name: 'Fotos de Tênis' });
  expect(within(dialog).getByText('2 / 3')).toBeInTheDocument();
  expect(within(dialog).getByAltText('Foto 2 de 3 de Tênis')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Fechar fotos' })).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
});

test('na tela cheia, arrastar e as setas trocam a foto', () => {
  render(<ProductGallery images={fotos} name="Tênis" />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir foto 1 de 3 de Tênis' }));
  const dialog = screen.getByRole('dialog');
  const track = layout(within(dialog).getByAltText('Foto 1 de 3 de Tênis').closest('div')!.parentElement as HTMLElement);
  swipeTo(track, 2);
  expect(within(dialog).getByText('3 / 3')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Próxima foto' })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Foto anterior' }));
  expect(within(dialog).getByText('2 / 3')).toBeInTheDocument();
  fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
  expect(within(dialog).getByText('1 / 3')).toBeInTheDocument();
});

test('o X fecha pelo histórico, e a foto grande fica na última vista', () => {
  const back = jest.spyOn(window.history, 'back').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  });
  render(<ProductGallery images={fotos} name="Tênis" />);
  const hero = heroTrack();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir foto 1 de 3 de Tênis' }));
  expect(window.history.state?.[VIEWER_HISTORY_KEY]).toBe(true);
  // o roteador do Next ignora no popstate a entrada sem __N
  expect(window.history.state?.__N).toBe(false);
  const dialog = screen.getByRole('dialog');
  fireEvent.keyDown(dialog, { key: 'ArrowRight' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar fotos' }));
  expect(back).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(thumb(2)).toHaveAttribute('aria-pressed', 'true');
  expect((hero as any).scrollTo).toHaveBeenLastCalledWith({ left: WIDTH, behavior: 'auto' });
  expect(document.body.style.overflow).toBe('');
  back.mockRestore();
});

test('o voltar do celular (popstate) fecha a tela cheia', () => {
  render(<ProductGallery images={fotos} name="Tênis" />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir foto 1 de 3 de Tênis' }));
  act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('Esc fecha a tela cheia', () => {
  jest.spyOn(window.history, 'back').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  });
  render(<ProductGallery images={fotos} name="Tênis" />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir foto 1 de 3 de Tênis' }));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  (window.history.back as jest.Mock).mockRestore();
});

test('uma foto só: abre a tela cheia, sem bolinhas, miniaturas, contador nem setas', () => {
  render(<ProductGallery images={['https://img/a.jpg']} name="Tênis" />);
  expect(screen.queryByRole('button', { name: /Ver foto/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir foto de Tênis' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByAltText('Foto de Tênis')).toBeInTheDocument();
  expect(within(dialog).queryByText(/\/ 1/)).toBeNull();
  expect(within(dialog).queryByRole('button', { name: 'Próxima foto' })).toBeNull();
});

test('sem foto: mostra o ícone e nada para abrir', () => {
  render(<ProductGallery images={[]} name="Tênis" />);
  expect(screen.getByRole('region', { name: 'Fotos de Tênis' })).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
});

test('CSS só com tokens do DS v2', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'ProductGallery.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
});
