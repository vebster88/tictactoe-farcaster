// Vercel API endpoint для генерации Splash Screen изображения

export default async function handler(req, res) {
  try {
    // Генерируем SVG для splash screen
    const svg = generateSplashSVG();
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 часа
    
    return res.status(200).send(svg);
    
  } catch (error) {
    console.error('Splash generation error:', error);
    
    // Возвращаем простое изображение ошибки
    const errorSvg = generateErrorSplash();
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.status(500).send(errorSvg);
  }
}

function generateSplashSVG() {
  return `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6200EA;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1a1a2e;stop-opacity:1" />
    </linearGradient>
    <style>
      .title { fill: #ffffff; font-family: Arial, sans-serif; font-size: 48px; font-weight: bold; text-anchor: middle; }
      .subtitle { fill: #ffffff; font-family: Arial, sans-serif; font-size: 24px; text-anchor: middle; }
      .cell { fill: none; stroke: #ffffff; stroke-width: 4; }
      .x { fill: #e94560; font-family: Arial, sans-serif; font-size: 60px; font-weight: bold; text-anchor: middle; }
      .o { fill: #ffffff; font-family: Arial, sans-serif; font-size: 60px; font-weight: bold; text-anchor: middle; }
      .icon-bg { fill: #ffffff; opacity: 0.2; }
      .icon { fill: #ffffff; font-family: Arial, sans-serif; font-size: 30px; font-weight: bold; text-anchor: middle; }
    </style>
  </defs>
  
  <!-- Фон -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  
  <!-- Игровое поле (центр) -->
  <g transform="translate(450, 165)">
    <!-- Сетка 3x3 -->
    <rect x="0" y="0" width="100" height="100" class="cell"/>
    <rect x="100" y="0" width="100" height="100" class="cell"/>
    <rect x="200" y="0" width="100" height="100" class="cell"/>
    <rect x="0" y="100" width="100" height="100" class="cell"/>
    <rect x="100" y="100" width="100" height="100" class="cell"/>
    <rect x="200" y="100" width="100" height="100" class="cell"/>
    <rect x="0" y="200" width="100" height="100" class="cell"/>
    <rect x="100" y="200" width="100" height="100" class="cell"/>
    <rect x="200" y="200" width="100" height="100" class="cell"/>
    
    <!-- Символы X и O -->
    <text x="50" y="70" class="x" dominant-baseline="central">X</text>
    <text x="250" y="70" class="o" dominant-baseline="central">O</text>
    <text x="150" y="170" class="x" dominant-baseline="central">X</text>
    <text x="50" y="270" class="o" dominant-baseline="central">O</text>
    <text x="250" y="270" class="x" dominant-baseline="central">X</text>
  </g>
  
  <!-- Заголовок -->
  <text x="600" y="450" class="title">TicTacToe Farcaster</text>
  
  <!-- Подзаголовок -->
  <text x="600" y="500" class="subtitle">Play directly in Farcaster!</text>
  
  <!-- Иконка игры (левый верхний угол) -->
  <circle cx="100" cy="100" r="40" class="icon-bg"/>
  <text x="100" y="115" class="icon" dominant-baseline="central">🎮</text>
  
  <!-- Декоративные элементы -->
  <circle cx="1100" cy="100" r="20" fill="#ffffff" opacity="0.1"/>
  <circle cx="1050" cy="150" r="15" fill="#ffffff" opacity="0.1"/>
  <circle cx="100" cy="530" r="25" fill="#ffffff" opacity="0.1"/>
  <circle cx="150" cy="580" r="18" fill="#ffffff" opacity="0.1"/>
</svg>`;
}

function generateErrorSplash() {
  return `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#1a1a2e"/>
  <text x="600" y="315" fill="#ffffff" font-family="Arial" font-size="32" text-anchor="middle">
    TicTacToe Farcaster
  </text>
</svg>`;
}

