// Vercel API endpoint для обработки Farcaster Frame действий

// Встроенная логика Frame (без импорта ES6 модулей)

// Игровая логика
function createNewGame() {
  return {
    board: Array(9).fill(null),
    currentPlayer: 'X',
    winner: null,
    finished: false,
    moves: 0
  };
}

function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // горизонтали
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // вертикали
    [0, 4, 8], [2, 4, 6] // диагонали
  ];
  
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function processMove(gameState, position) {
  const pos = parseInt(position) - 1;
  
  if (pos < 0 || pos > 8 || gameState.board[pos] || gameState.finished) {
    return gameState; // Недопустимый ход
  }
  
  const newState = { ...gameState };
  newState.board[pos] = newState.currentPlayer;
  newState.moves++;
  
  // Проверка победы
  const winner = checkWinner(newState.board);
  if (winner) {
    newState.winner = winner;
    newState.finished = true;
  } else if (newState.moves === 9) {
    newState.finished = true;
  } else {
    newState.currentPlayer = newState.currentPlayer === 'X' ? 'O' : 'X';
    
    // Ход ИИ (случайный)
    if (newState.currentPlayer === 'O' && !newState.finished) {
      const emptyPositions = newState.board.map((cell, index) => cell === null ? index : null).filter(pos => pos !== null);
      if (emptyPositions.length > 0) {
        const aiMove = emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
        newState.board[aiMove] = 'O';
        newState.moves++;
        
        const aiWinner = checkWinner(newState.board);
        if (aiWinner) {
          newState.winner = aiWinner;
          newState.finished = true;
        } else if (newState.moves === 9) {
          newState.finished = true;
        } else {
          newState.currentPlayer = 'X';
        }
      }
    }
  }
  
  return newState;
}

function generateFrameResponse(gameState) {
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://tiktaktoe-farcaster.vercel.app';
  const imageUrl = `${baseUrl}/api/frame/image?state=${encodeURIComponent(JSON.stringify(gameState))}`;
  
  let buttons = [];
  if (gameState.finished) {
    buttons = [
      { text: 'Новая игра', action: 'post' },
      { text: 'Поделиться', action: 'link', target: baseUrl }
    ];
  } else {
    buttons = [
      { text: 'Сделать ход', action: 'post' }
    ];
  }
  
  return {
    image: imageUrl,
    buttons,
    input: gameState.finished ? null : { text: 'Позиция 1-9' },
    state: JSON.stringify(gameState)
  };
}

export default async function handler(req, res) {
  // Обрабатываем GET и POST запросы
  if (req.method === 'GET') {
    // Возвращаем начальный Frame
    const gameState = createNewGame();
    const frameResponse = generateFrameResponse(gameState);
    const html = generateFrameHTML(frameResponse);
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Парсим тело запроса
    const body = req.body;
    
    // Валидация Farcaster Frame данных
    if (!body.untrustedData) {
      return res.status(400).json({ error: 'Invalid frame data' });
    }

    const { buttonIndex, inputText, state } = body.untrustedData;
    
    // Обрабатываем действие
    let gameState = state ? JSON.parse(state) : createNewGame();
    
    switch (buttonIndex) {
      case 1:
        // Сделать ход или начать игру
        if (!state) {
          gameState = createNewGame();
        } else if (inputText && !gameState.finished) {
          gameState = processMove(gameState, inputText);
        }
        break;
        
      case 2:
        // Новая игра или правила
        gameState = createNewGame();
        break;
    }
    
    const frameResponse = generateFrameResponse(gameState);

    // Возвращаем HTML с Frame метаданными
    const html = generateFrameHTML(frameResponse);
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
    
  } catch (error) {
    console.error('Frame action error:', error);
    
    const errorResponse = {
      image: `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://tiktaktoe-farcaster.vercel.app'}/api/frame/image`,
      buttons: [{ text: 'Попробовать снова', action: 'post' }],
      input: null,
      state: null
    };
    const html = generateFrameHTML(errorResponse);
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send(html);
  }
}

function generateFrameHTML(frameData) {
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://tiktaktoe-farcaster.vercel.app';
  const metaTags = [
    '<meta property="fc:frame" content="vNext" />',
    `<meta property="fc:frame:image" content="${frameData.image}" />`,
    `<meta property="fc:frame:post_url" content="${baseUrl}/api/frame/action" />`
  ];

  // Добавляем кнопки
  frameData.buttons.forEach((button, index) => {
    metaTags.push(`<meta property="fc:frame:button:${index + 1}" content="${button.text}" />`);
    if (button.action) {
      metaTags.push(`<meta property="fc:frame:button:${index + 1}:action" content="${button.action}" />`);
    }
    if (button.target) {
      metaTags.push(`<meta property="fc:frame:button:${index + 1}:target" content="${button.target}" />`);
    }
  });

  // Добавляем input если есть
  if (frameData.input) {
    metaTags.push(`<meta property="fc:frame:input:text" content="${frameData.input.text}" />`);
  }

  // Добавляем состояние если есть
  if (frameData.state) {
    metaTags.push(`<meta property="fc:frame:state" content="${encodeURIComponent(frameData.state)}" />`);
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <title>TicTacToe Farcaster Frame</title>
  ${metaTags.join('\n  ')}
  <meta property="og:title" content="TicTacToe Farcaster" />
  <meta property="og:description" content="Играйте в крестики-нолики прямо в Farcaster!" />
  <meta property="og:image" content="${frameData.image}" />
</head>
<body>
  <h1>TicTacToe Farcaster Frame</h1>
  <p>Это Frame для Farcaster. Откройте в Warpcast для игры!</p>
  <img src="${frameData.image}" alt="Game Board" style="max-width: 100%; height: auto;" />
</body>
</html>`;
}
