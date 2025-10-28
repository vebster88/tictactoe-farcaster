// Vercel API endpoint для отображения правил игры

export default async function handler(req, res) {
  try {
    const svg = generateRulesSVG();
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    return res.status(200).send(svg);
    
  } catch (error) {
    console.error('Rules generation error:', error);
    
    const errorSvg = generateErrorSVG();
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.status(500).send(errorSvg);
  }
}

function generateRulesSVG() {
  const width = 600;
  const height = 800;
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .bg { fill: #1a1a2e; }
      .text { fill: #ffffff; font-family: Arial, sans-serif; }
      .title { font-size: 28px; font-weight: bold; }
      .subtitle { font-size: 20px; font-weight: bold; fill: #e94560; }
      .rule { font-size: 16px; }
      .example { fill: #0f3460; stroke: #e94560; stroke-width: 2; }
      .x { fill: #e94560; font-size: 40px; font-weight: bold; }
      .o { fill: #0f3460; font-size: 40px; font-weight: bold; }
    </style>
  </defs>
  
  <!-- Фон -->
  <rect width="${width}" height="${height}" class="bg"/>
  
  <!-- Заголовок -->
  <text x="${width/2}" y="40" class="text title" text-anchor="middle">📖 Правила игры</text>
  <text x="${width/2}" y="70" class="text title" text-anchor="middle">Крестики-Нолики</text>
  
  <!-- Цель игры -->
  <text x="50" y="120" class="text subtitle">🎯 Цель игры:</text>
  <text x="70" y="150" class="text rule">Первым поставить 3 своих символа в ряд</text>
  <text x="70" y="175" class="text rule">(по горизонтали, вертикали или диагонали)</text>
  
  <!-- Как играть -->
  <text x="50" y="220" class="text subtitle">🎮 Как играть в Frame:</text>
  <text x="70" y="250" class="text rule">1. Нажмите "Начать игру"</text>
  <text x="70" y="275" class="text rule">2. Введите номер позиции (1-9)</text>
  <text x="70" y="300" class="text rule">3. Нажмите кнопку для хода</text>
  <text x="70" y="325" class="text rule">4. Игра против случайного ИИ</text>
  
  <!-- Пример поля -->
  <text x="50" y="370" class="text subtitle">📋 Позиции на поле:</text>
  
  <!-- Мини игровое поле с номерами -->
  <g transform="translate(200, 390)">
    <!-- Клетки 3x3 -->
    <rect x="0" y="0" width="60" height="60" class="example"/>
    <rect x="70" y="0" width="60" height="60" class="example"/>
    <rect x="140" y="0" width="60" height="60" class="example"/>
    <rect x="0" y="70" width="60" height="60" class="example"/>
    <rect x="70" y="70" width="60" height="60" class="example"/>
    <rect x="140" y="70" width="60" height="60" class="example"/>
    <rect x="0" y="140" width="60" height="60" class="example"/>
    <rect x="70" y="140" width="60" height="60" class="example"/>
    <rect x="140" y="140" width="60" height="60" class="example"/>
    
    <!-- Номера позиций -->
    <text x="30" y="35" class="text rule" text-anchor="middle" dominant-baseline="central">1</text>
    <text x="100" y="35" class="text rule" text-anchor="middle" dominant-baseline="central">2</text>
    <text x="170" y="35" class="text rule" text-anchor="middle" dominant-baseline="central">3</text>
    <text x="30" y="105" class="text rule" text-anchor="middle" dominant-baseline="central">4</text>
    <text x="100" y="105" class="text rule" text-anchor="middle" dominant-baseline="central">5</text>
    <text x="170" y="105" class="text rule" text-anchor="middle" dominant-baseline="central">6</text>
    <text x="30" y="175" class="text rule" text-anchor="middle" dominant-baseline="central">7</text>
    <text x="100" y="175" class="text rule" text-anchor="middle" dominant-baseline="central">8</text>
    <text x="170" y="175" class="text rule" text-anchor="middle" dominant-baseline="central">9</text>
  </g>
  
  <!-- Пример победы -->
  <text x="50" y="620" class="text subtitle">🏆 Пример победы:</text>
  
  <!-- Пример поля с победой -->
  <g transform="translate(200, 640)">
    <rect x="0" y="0" width="60" height="60" class="example"/>
    <rect x="70" y="0" width="60" height="60" class="example"/>
    <rect x="140" y="0" width="60" height="60" class="example"/>
    <rect x="0" y="70" width="60" height="60" class="example"/>
    <rect x="70" y="70" width="60" height="60" class="example"/>
    <rect x="140" y="70" width="60" height="60" class="example"/>
    <rect x="0" y="140" width="60" height="60" class="example"/>
    <rect x="70" y="140" width="60" height="60" class="example"/>
    <rect x="140" y="140" width="60" height="60" class="example"/>
    
    <!-- Пример игры -->
    <text x="30" y="40" class="x" text-anchor="middle" dominant-baseline="central">X</text>
    <text x="100" y="40" class="x" text-anchor="middle" dominant-baseline="central">X</text>
    <text x="170" y="40" class="x" text-anchor="middle" dominant-baseline="central">X</text>
    <text x="30" y="110" class="o" text-anchor="middle" dominant-baseline="central">O</text>
    <text x="100" y="110" class="o" text-anchor="middle" dominant-baseline="central">O</text>
  </g>
  
  <text x="70" y="760" class="text rule">X победил - три в ряд по горизонтали!</text>
  
  <!-- Подпись -->
  <text x="${width/2}" y="${height - 20}" class="text" text-anchor="middle" style="font-size: 12px; fill: #666;">
    vebster88 | TicTacToe Farcaster Frame
  </text>
</svg>`;
}

function generateErrorSVG() {
  return `
<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
  <rect width="600" height="400" fill="#1a1a2e"/>
  <text x="300" y="200" fill="#e94560" font-family="Arial" font-size="24" text-anchor="middle">
    Ошибка загрузки правил
  </text>
</svg>`;
}
