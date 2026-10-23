/** Carrossel da home: passa sozinho, volta ao primeiro no fim e para enquanto a pessoa mexe. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Banner, BANNER_AUTOPLAY_MS } from '../Banner';

const items = [
  { id: 'b1', title: 'Um', href: '/a' },
  { id: 'b2', title: 'Dois', href: '/b' },
  { id: 'b3', title: 'Três', href: '/c' },
];
const WIDTH = 300;

let scrollTo: jest.Mock;

function setup(list = items) {
  render(<Banner items={list} />);
  const track = screen.getByRole('region');
  // jsdom não faz layout: cada banner fica WIDTH px à direita do anterior, e scrollTo move a faixa.
  Array.from(track.children).forEach((el, i) => Object.defineProperty(el, 'offsetLeft', { configurable: true, value: i * WIDTH }));
  scrollTo = jest.fn(({ left }) => { track.scrollLeft = left; });
  (track as any).scrollTo = scrollTo;
  return track;
}
const tick = () => act(() => { jest.advanceTimersByTime(BANNER_AUTOPLAY_MS); });

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.useRealTimers(); delete (window as any).matchMedia; });

test('passa para o próximo a cada 5 segundos', () => {
  setup();
  expect(BANNER_AUTOPLAY_MS).toBe(5000);
  act(() => { jest.advanceTimersByTime(4999); });
  expect(scrollTo).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(1); });
  expect(scrollTo).toHaveBeenLastCalledWith({ left: WIDTH, behavior: 'smooth' });
  tick();
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 2 * WIDTH, behavior: 'smooth' });
});

test('no último volta para o primeiro', () => {
  const track = setup();
  track.scrollLeft = 2 * WIDTH;
  tick();
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' });
});

test('segue de onde a pessoa arrastou', () => {
  const track = setup();
  track.scrollLeft = WIDTH + 20; // parou perto do segundo
  tick();
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 2 * WIDTH, behavior: 'smooth' });
});

test('para enquanto o dedo está na faixa e volta depois', () => {
  const track = setup();
  fireEvent.touchStart(track);
  tick(); tick();
  expect(scrollTo).not.toHaveBeenCalled();
  fireEvent.touchEnd(track);
  tick();
  expect(scrollTo).toHaveBeenCalledTimes(1);
});

test('para com o foco num banner (teclado)', () => {
  setup();
  fireEvent.focus(screen.getByRole('link', { name: 'Um' }));
  tick();
  expect(scrollTo).not.toHaveBeenCalled();
});

test('com um banner só, não passa', () => {
  setup([items[0]]);
  tick();
  expect(scrollTo).not.toHaveBeenCalled();
});

test('em "reduzir movimento" não passa sozinho', () => {
  (window as any).matchMedia = jest.fn().mockReturnValue({ matches: true });
  setup();
  tick();
  expect(scrollTo).not.toHaveBeenCalled();
});
