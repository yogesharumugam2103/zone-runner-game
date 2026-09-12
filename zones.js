export const ZONE_ORDER = ['green', 'blue', 'yellow', 'gray', 'echo'];

export const ZONES = {
  green: {
    name: 'GREEN ZONE',
    skyA: '#051408', skyB: '#1a5c38',
    gndFill: '#030e05', gndLine: '#2ecc71',
    platFill: '#1a5c32', platTop: '#4eff8a',
    pColor: '#5bff9a', pGlow: 'rgba(91,255,154,.7)',
    accent: '#39ff80', aGlow: '#00ff6a',
    gravity: 0.50, jump: -12.5, speed: 4.4, friction: 0.855,
    flipped: false, floaty: false, icy: false,
    bg: 'leaves',
    patterns: ['G_SINGLE_SPIKE', 'G_SPIKE_ROW', 'G_ENEMY_JUMP', 'G_PLATFORM_OVER', 'G_SAW_PLATFORM', 'G_LASER_DODGE', 'G_ENEMY_PAIR', 'G_CHAIN']
  },
  blue: {
    name: 'ICE ZONE',
    skyA: '#00060f', skyB: '#001530',
    gndFill: '#00060f', gndLine: '#1a8fff',
    platFill: '#002050', platTop: '#55aaff',
    pColor: '#55bbff', pGlow: 'rgba(85,187,255,.7)',
    accent: '#1199ff', aGlow: '#66ccff',
    gravity: 0.50, jump: -12.5, speed: 5.0, friction: 0.9992,
    flipped: false, floaty: false, icy: true,
    bg: 'snow',
    patterns: ['B_ICE_BLOCK', 'B_FREEZE_GAP', 'B_DOUBLE_BLOCK', 'B_ICE_BLOCK', 'B_SLIP_AND_JUMP', 'B_FREEZE_GAP']
  },
  yellow: {
    name: 'INVERTED ZONE',
    skyA: '#160c00', skyB: '#4a2e00',
    gndFill: '#1a0f00', gndLine: '#ffcc00',
    platFill: '#7a5500', platTop: '#ffe44d',
    pColor: '#ffe566', pGlow: 'rgba(255,229,102,.7)',
    accent: '#ffcc00', aGlow: '#ffee55',
    gravity: -0.50, jump: 12.5, speed: 4.0, friction: 0.855,
    flipped: true, floaty: false, icy: false,
    bg: 'neon_stars',
    patterns: ['Y_SINGLE_DRONE', 'Y_DRONE_PAIR', 'Y_CEIL_SPIKE', 'Y_DRONE_GAUNTLET', 'Y_MIXED', 'Y_SINGLE_DRONE', 'Y_CEIL_SPIKE']
  },
  gray: {
    name: 'SPACE ZONE',
    skyA: '#040404', skyB: '#111',
    gndFill: '#080808', gndLine: '#333',
    platFill: '#1e1e1e', platTop: '#444',
    pColor: '#aaa', pGlow: 'rgba(170,170,170,.6)',
    accent: '#666', aGlow: '#aaa',
    gravity: 0, jump: -5, speed: 3.5, friction: 0.96,
    flipped: false, floaty: true, icy: false,
    bg: 'debris',
    patterns: ['S_ASTEROID_WAVE', 'S_METEOR_STREAK', 'S_DEBRIS_CORRIDOR', 'S_MIXED_FIELD', 'S_METEOR_STREAK']
  },
  echo: {
    name: 'ECHO ZONE',
    skyA: '#0d0018', skyB: '#2e0050',
    gndFill: '#0a0012', gndLine: '#b366ff',
    platFill: '#3a1060', platTop: '#d9a3ff',
    pColor: '#c299ff', pGlow: 'rgba(194,153,255,.7)',
    accent: '#a64dff', aGlow: '#d9a3ff',
    gravity: 0.50, jump: -12.5, speed: 4.6, friction: 0.855,
    flipped: false, floaty: false, icy: false,
    bg: 'debris',
    patterns: ['E_SPIKE_ECHO', 'E_ENEMY_ECHO', 'E_SAW_ECHO', 'E_MIXED_ECHO']
  }
};

export const ZONE_BG_PARTICLES = {
  green:  { count: 36, color: 'rgba(255,244,200,.85)', streakColor: null },
  blue:   { count: 70, color: 'rgba(255,255,255,.85)', streakColor: 'rgba(255,255,255,.6)' },
  yellow: { count: 40, color: 'rgba(255,214,110,.85)', streakColor: 'rgba(255,170,60,.6)' },
  gray:   { count: 90, color: 'rgba(255,255,255,.9)', streakColor: 'rgba(200,170,255,.5)' },
  echo:   { count: 65, color: 'rgba(220,170,255,.85)', streakColor: 'rgba(190,110,255,.6)' }
};