// Vercel API endpoint для генерации иконки приложения

export default async function handler(req, res) {
  try {
    const { size = '512' } = req.query;
    const iconSize = parseInt(size);
    
    // Поддерживаемые размеры
    const supportedSizes = [16, 32, 48, 64, 96, 128, 192, 256, 512, 1024];
    const finalSize = supportedSizes.includes(iconSize) ? iconSize : 512;
    
    // Генерируем SVG иконку
    const svg = generateIconSVG(finalSize);
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 часа
    
    return res.status(200).send(svg);
    
  } catch (error) {
    console.error('Icon generation error:', error);
    
    // Возвращаем простую иконку ошибки
    const errorSvg = generateSimpleIcon();
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.status(500).send(errorSvg);
  }
}

function generateIconSVG(size = 512) {
  const scale = size / 512;
  const gridOffset = 106 * scale;
  const gridSize = 300 * scale;
  
  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Градиенты -->
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6200EA;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#8b5cf6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1a1a2e;stop-opacity:1" />
    </linearGradient>
    
    <linearGradient id="xGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#e94560;stop-opacity:1" />
    </linearGradient>
    
    <linearGradient id="oGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#45b7b8;stop-opacity:1" />
    </linearGradient>
    
    <!-- Тень -->
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="${8 * scale}" stdDeviation="${12 * scale}" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
    
    <style>
      .icon-bg { fill: url(#bgGradient); }
      .grid-line { stroke: #ffffff; stroke-width: ${8 * scale}; stroke-linecap: round; opacity: 0.9; }
      .x-symbol { fill: url(#xGradient); font-family: Arial, sans-serif; font-weight: bold; text-anchor: middle; dominant-baseline: central; }
      .o-symbol { fill: url(#oGradient); font-family: Arial, sans-serif; font-weight: bold; text-anchor: middle; dominant-baseline: central; }
    </style>
  </defs>
  
  <!-- Основной фон с закругленными углами -->
  <rect x="0" y="0" width="${size}" height="${size}" rx="${90 * scale}" ry="${90 * scale}" class="icon-bg" filter="url(#shadow)"/>
  
  <!-- Внутренняя рамка -->
  <rect x="${20 * scale}" y="${20 * scale}" width="${472 * scale}" height="${472 * scale}" rx="${70 * scale}" ry="${70 * scale}" fill="none" stroke="#ffffff" stroke-width="${2 * scale}" opacity="0.3"/>
  
  <!-- Игровая сетка 3x3 -->
  <g transform="translate(${gridOffset}, ${gridOffset})">
    <!-- Вертикальные линии -->
    <line x1="${100 * scale}" y1="${20 * scale}" x2="${100 * scale}" y2="${280 * scale}" class="grid-line"/>
    <line x1="${200 * scale}" y1="${20 * scale}" x2="${200 * scale}" y2="${280 * scale}" class="grid-line"/>
    
    <!-- Горизонтальные линии -->
    <line x1="${20 * scale}" y1="${100 * scale}" x2="${280 * scale}" y2="${100 * scale}" class="grid-line"/>
    <line x1="${20 * scale}" y1="${200 * scale}" x2="${280 * scale}" y2="${200 * scale}" class="grid-line"/>
    
    <!-- Символы X и O -->
    <text x="${60 * scale}" y="${60 * scale}" class="x-symbol" font-size="${60 * scale}">X</text>
    <text x="${250 * scale}" y="${60 * scale}" class="o-symbol" font-size="${50 * scale}">O</text>
    <text x="${150 * scale}" y="${150 * scale}" class="x-symbol" font-size="${60 * scale}">X</text>
    <text x="${60 * scale}" y="${240 * scale}" class="o-symbol" font-size="${50 * scale}">O</text>
    <text x="${250 * scale}" y="${240 * scale}" class="x-symbol" font-size="${60 * scale}">X</text>
    
    <!-- Выигрышная линия (диагональ) -->
    <line x1="${35 * scale}" y1="${35 * scale}" x2="${265 * scale}" y2="${265 * scale}" stroke="url(#xGradient)" stroke-width="${6 * scale}" stroke-linecap="round" opacity="0.8"/>
  </g>
  
  <!-- Декоративные элементы -->
  <ellipse cx="${180 * scale}" cy="${120 * scale}" rx="${40 * scale}" ry="${20 * scale}" fill="#ffffff" opacity="0.2" transform="rotate(-30 ${180 * scale} ${120 * scale})"/>
  <ellipse cx="${350 * scale}" cy="${200 * scale}" rx="${25 * scale}" ry="${12 * scale}" fill="#ffffff" opacity="0.15" transform="rotate(45 ${350 * scale} ${200 * scale})"/>
  
  ${size >= 128 ? `<text x="${size / 2}" y="${480 * scale}" fill="#ffffff" font-family="Arial" font-size="${16 * scale}" font-weight="bold" text-anchor="middle" opacity="0.7">TicTacToe</text>` : ''}
</svg>`;
}

function generateSimpleIcon() {
  return `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="90" fill="#6200EA"/>
  <text x="256" y="280" fill="#ffffff" font-family="Arial" font-size="200" font-weight="bold" text-anchor="middle">⚡</text>
</svg>`;
}
