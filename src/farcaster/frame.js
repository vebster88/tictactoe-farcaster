// Farcaster Frame интеграция для TicTacToe
// Позволяет играть прямо в Warpcast

export class FarcasterFrame {
  constructor() {
    this.baseUrl = window.location.origin;
    this.gameState = null;
  }

  // Генерация Frame метаданных для HTML
  generateFrameMeta(gameState = null) {
    const frameUrl = `${this.baseUrl}/frame`;
    const imageUrl = `${this.baseUrl}/api/frame/image${gameState ? `?state=${encodeURIComponent(JSON.stringify(gameState))}` : ''}`;
    
    return {
      'fc:frame': 'vNext',
      'fc:frame:image': imageUrl,
      'fc:frame:button:1': gameState ? 'Сделать ход' : 'Начать игру',
      'fc:frame:button:2': gameState ? 'Новая игра' : 'Правила',
      'fc:frame:post_url': `${this.baseUrl}/api/frame/action`,
      'og:image': imageUrl,
      'og:title': 'TicTacToe Farcaster',
      'og:description': 'Играйте в крестики-нолики прямо в Farcaster!'
    };
  }

  // Обработка действий Frame
  async handleFrameAction(body) {
    try {
      const { buttonIndex, inputText, state } = body;
      let gameState = state ? JSON.parse(state) : this.createNewGame();
      
      switch (buttonIndex) {
        case 1:
          // Сделать ход или начать игру
          if (!state) {
            gameState = this.createNewGame();
          } else {
            gameState = this.processMove(gameState, inputText);
          }
          break;
          
        case 2:
          // Новая игра или правила
          gameState = this.createNewGame();
          break;
      }
      
      return this.generateFrameResponse(gameState);
    } catch (error) {
      console.error('Frame action error:', error);
      return this.generateErrorResponse();
    }
  }

  // Создание новой игры
  createNewGame() {
    return {
      board: Array(9).fill(null),
      currentPlayer: 'X',
      winner: null,
      finished: false,
      moves: 0
    };
  }

  // Обработка хода
  processMove(gameState, position) {
    const pos = parseInt(position) - 1;
    
    if (pos < 0 || pos > 8 || gameState.board[pos] || gameState.finished) {
      return gameState; // Недопустимый ход
    }
    
    const newState = { ...gameState };
    newState.board[pos] = newState.currentPlayer;
    newState.moves++;
    
    // Проверка победы
    const winner = this.checkWinner(newState.board);
    if (winner) {
      newState.winner = winner;
      newState.finished = true;
    } else if (newState.moves === 9) {
      newState.finished = true;
    } else {
      newState.currentPlayer = newState.currentPlayer === 'X' ? 'O' : 'X';
    }
    
    return newState;
  }

  // Проверка победителя
  checkWinner(board) {
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

  // Генерация ответа Frame
  generateFrameResponse(gameState) {
    const imageUrl = `${this.baseUrl}/api/frame/image?state=${encodeURIComponent(JSON.stringify(gameState))}`;
    
    let buttons = [];
    if (gameState.finished) {
      buttons = [
        { text: 'Новая игра', action: 'post' },
        { text: 'Поделиться', action: 'link', target: this.baseUrl }
      ];
    } else {
      buttons = [
        { text: 'Позиция 1-9', action: 'post' }
      ];
    }
    
    return {
      image: imageUrl,
      buttons,
      input: gameState.finished ? null : { text: 'Введите позицию (1-9)' },
      state: JSON.stringify(gameState)
    };
  }

  // Ответ при ошибке
  generateErrorResponse() {
    return {
      image: `${this.baseUrl}/api/frame/error`,
      buttons: [
        { text: 'Попробовать снова', action: 'post' }
      ]
    };
  }
}

// Экспорт экземпляра
export const farcasterFrame = new FarcasterFrame();
