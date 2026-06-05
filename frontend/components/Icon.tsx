import React from 'react';

type IconName =
  | 'wallet' | 'money' | 'bank' | 'credit-card' | 'cash' | 'coins'
  | 'chart-up' | 'chart-bar' | 'chart-line' | 'trending-up' | 'trending-down'
  | 'clipboard' | 'list' | 'file-text' | 'receipt'
  | 'users' | 'user' | 'store' | 'motorcycle' | 'truck'
  | 'lock' | 'shield' | 'key' | 'settings' | 'sliders'
  | 'check' | 'check-circle' | 'x' | 'x-circle' | 'alert-triangle' | 'info'
  | 'clock' | 'calendar' | 'hourglass'
  | 'send' | 'download' | 'upload' | 'arrow-right' | 'arrow-left' | 'arrow-up' | 'arrow-down'
  | 'chat' | 'megaphone' | 'headphones' | 'tag' | 'palette'
  | 'shopping-bag' | 'shopping-cart' | 'package' | 'gift'
  | 'star' | 'zap' | 'trophy' | 'medal' | 'gem' | 'target' | 'crown' | 'award'
  | 'search' | 'filter' | 'refresh' | 'external-link'
  | 'plus' | 'minus' | 'edit' | 'trash'
  | 'briefcase' | 'building' | 'home' | 'map-pin'
  | 'percent' | 'hash' | 'at-sign' | 'link'
  | 'eye' | 'eye-off' | 'bell' | 'mail'
  | 'play' | 'pause' | 'stop' | 'circle' | 'dot'
  | 'chevron-right' | 'chevron-down'
  | 'dollar-sign' | 'ban' | 'menu'
  | 'tree' | 'egg' | 'tent' | 'pumpkin';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

const paths: Record<IconName, string> = {
  wallet: 'M21 18V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3H19A2 2 0 0 1 21 5V6M16 12A1 1 0 1 0 16 14 1 1 0 0 0 16 12M3 10H21',
  money: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  bank: 'M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3',
  'credit-card': 'M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM1 10h22',
  cash: 'M2 6h20v12H2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 12h.01M18 12h.01',
  coins: 'M12 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 14a7 7 0 1 1 0 14 7 7 0 0 1 0-14z',
  'chart-up': 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  'chart-bar': 'M18 20V10M12 20V4M6 20v-6',
  'chart-line': 'M22 12h-4l-3 9L9 3l-3 9H2',
  'trending-up': 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  'trending-down': 'M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6',
  clipboard: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  'file-text': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  receipt: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM16 8H8M16 12H8M10 16H8',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  store: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  motorcycle: 'M5 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM7.5 16H5l2-5h4l3 5h5',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  settings: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  check: 'M20 6L9 17l-5-5',
  'check-circle': 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
  x: 'M18 6L6 18M6 6l12 12',
  'x-circle': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6',
  'alert-triangle': 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18',
  hourglass: 'M5 22h14M5 2h14M17 22v-2.28A4 4 0 0 0 16 16l-4-4 4-4a4 4 0 0 0 1-3.72V2M7 22v-2.28A4 4 0 0 1 8 16l4-4-4-4a4 4 0 0 1-1-3.72V2',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
  'arrow-up': 'M12 19V5M5 12l7-7 7 7',
  'arrow-down': 'M12 5v14M19 12l-7 7-7-7',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  megaphone: 'M3 11l18-5v12L3 13v-2zM11.6 16.8a3 3 0 1 1-5.8-1.6',
  headphones: 'M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
  palette: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.3 0-.9.8-1.7 1.7-1.7H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9.8-10-9.8zM6.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM9.5 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM14.5 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM17.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
  'shopping-bag': 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  'shopping-cart': 'M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM21 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  package: 'M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
  gift: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  trophy: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17a2 2 0 0 0-2 2H16a2 2 0 0 0-2-2v-2.34M18 2H6v7a6 6 0 0 0 12 0V2z',
  medal: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM8.21 13.89L7 23l5-3 5 3-1.21-9.12',
  gem: 'M6 3h12l4 6-10 13L2 9z',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  crown: 'M2 20h20L18 8l-4 5-2-7-2 7-4-5L2 20zM2 20h20v2H2z',
  award: 'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM8.21 13.89L7 23l5-3 5 3-1.21-9.11',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  'external-link': 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  briefcase: 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  building: 'M3 21h18M9 21V7l7-4v18M5 21V12h4M15 12h4v9',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  'map-pin': 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  percent: 'M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  hash: 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
  'at-sign': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-5.5 8.28',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'eye-off': 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6',
  play: 'M5 3l14 9-14 9V3z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  stop: 'M6 4h12v16H6z',
  circle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  dot: 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-down': 'M6 9l6 6 6-6',
  'dollar-sign': 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.93 4.93l14.14 14.14',
  menu: 'M3 12h18M3 6h18M3 18h18',
  tree: 'M12 2L6 10h3l-3 6h3l-3 6h12l-3-6h3l-3-6h3L12 2zM12 22v-4',
  egg: 'M12 2C8 2 5 7 5 12.5 5 17.5 8 22 12 22s7-4.5 7-9.5C19 7 16 2 12 2z',
  tent: 'M12 2L2 22h20L12 2zM12 2v20M7.5 12H16.5',
  pumpkin: 'M12 2c-1 0-2 .5-2 1.5 0 .5.2 1 .5 1.3C7 5.5 4 9 4 13c0 4.4 3.6 8 8 8s8-3.6 8-8c0-4-3-7.5-6.5-8.2.3-.3.5-.8.5-1.3 0-1-1-1.5-2-1.5zM12 5v16M4.5 13c2.5-1 5-1.5 7.5-1.5s5 .5 7.5 1.5',
};

export default function Icon({ name, size = 16, color = 'currentColor', className, style }: IconProps) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      <path d={d} />
    </svg>
  );
}

export type { IconName, IconProps };
