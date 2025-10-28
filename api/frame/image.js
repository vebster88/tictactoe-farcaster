// Vercel API endpoint для генерации изображений игрового поля

export default async function handler(req, res) {
  try {
    const { state } = req.query;
    
    let gameState = null;
    if (state) {
      try {
        gameState = JSON.parse(decodeURIComponent(state));
      } catch (e) {
        console.error('Invalid game state:', e);
      }
    }

    // Генерируем SVG изображение игрового поля
    const svg = generateGameBoardSVG(gameState);
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=30');
    
    return res.status(200).send(svg);
    
  } catch (error) {
    console.error('Image generation error:', error);
    
    // Возвращаем изображение ошибки
    const errorSvg = generateErrorSVG();
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.status(500).send(errorSvg);
  }
}

function generateGameBoardSVG(gameState) {
  const width = 600;
  const height = 700;
  const cellSize = 160;
  const startX = (width - cellSize * 3) / 2;
  const startY = 100;
  
  let board = Array(9).fill(null);
  let currentPlayer = 'X';
  let status = 'Новая игра - нажмите "Начать игру"';
  
  if (gameState) {
    board = gameState.board || board;
    currentPlayer = gameState.currentPlayer || currentPlayer;
    
    if (gameState.finished) {
      if (gameState.winner) {
        status = `🎉 Победил ${gameState.winner}! Нажмите "Новая игра"`;
      } else {
        status = '🤝 Ничья! Нажмите "Новая игра"';
      }
    } else {
      status = `Ход игрока ${currentPlayer} - введите позицию (1-9)`;
    }
  }
  
  // Генерируем SVG
  let svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .bg { fill: #1a1a2e; }
      .text { fill: #ffffff; font-family: Arial, sans-serif; }
      .title { font-size: 32px; font-weight: bold; }
      .status { font-size: 18px; }
      .cell { fill: #16213e; stroke: #0f3460; stroke-width: 3; }
      .cell-text { font-size: 80px; font-weight: bold; text-anchor: middle; dominant-baseline: central; }
      .x { fill: #e94560; }
      .o { fill: #0f3460; }
      .number { font-size: 24px; fill: #666; text-anchor: middle; dominant-baseline: central; }
    </style>
  </defs>
  
  <!-- Фон -->
  <rect width="${width}" height="${height}" class="bg"/>
  
  <!-- Заголовок -->
  <text x="${width/2}" y="50" class="text title" text-anchor="middle">TicTacToe Farcaster</text>
  
  <!-- Статус игры -->
  <text x="${width/2}" y="${startY - 30}" class="text status" text-anchor="middle">${status}</text>`;

  // Рисуем игровое поле
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const x = startX + col * cellSize;
    const y = startY + row * cellSize;
    
    // Клетка
    svg += `
  <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" class="cell"/>`;
    
    // Содержимое клетки
    if (board[i]) {
      svg += `
  <text x="${x + cellSize/2}" y="${y + cellSize/2}" class="cell-text ${board[i].toLowerCase()}">${board[i]}</text>`;
    } else {
      // Показываем номер позиции для пустых клеток
      svg += `
  <text x="${x + cellSize/2}" y="${y + cellSize/2}" class="number">${i + 1}</text>`;
    }
  }
  
  // Инструкции
  svg += `
  <text x="${width/2}" y="${startY + cellSize * 3 + 50}" class="text status" text-anchor="middle">
    ${gameState && !gameState.finished ? 'Введите номер позиции (1-9) и нажмите кнопку' : ''}
  </text>
  
  <!-- Логотип/подпись -->
  <text x="${width/2}" y="${height - 30}" class="text" text-anchor="middle" style="font-size: 14px; fill: #666;">
    Powered by vebster88 | Farcaster Frame
  </text>
</svg>`;

  return svg;
}

function generateErrorSVG() {
  return `
<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
  <rect width="600" height="400" fill="#1a1a2e"/>
  <text x="300" y="200" fill="#e94560" font-family="Arial" font-size="24" text-anchor="middle">
    Ошибка загрузки игры
  </text>
  <text x="300" y="240" fill="#ffffff" font-family="Arial" font-size="16" text-anchor="middle">
    Попробуйте еще раз
  </text>
</svg>`;
}
