// Vercel API endpoint для генерации Splash Screen PNG (200x200px) для fc:miniapp
// Требования: 200x200px, PNG формат

import { createCanvas } from 'canvas';

export default async function handler(req, res) {
  try {
    const size = 200;
    
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Фон с градиентом
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Игровое поле
    const boardSize = 150;
    const boardX = (size - boardSize) / 2;
    const boardY = 25;
    
    // Фон игрового поля
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(boardX, boardY, boardSize, boardSize);
    
    // Рамка
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(boardX, boardY, boardSize, boardSize);
    
    // Сетка 3x3
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    const cellSize = boardSize / 3;
    
    // Вертикальные линии
    ctx.beginPath();
    ctx.moveTo(boardX + cellSize, boardY);
    ctx.lineTo(boardX + cellSize, boardY + boardSize);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(boardX + cellSize * 2, boardY);
    ctx.lineTo(boardX + cellSize * 2, boardY + boardSize);
    ctx.stroke();
    
    // Горизонтальные линии
    ctx.beginPath();
    ctx.moveTo(boardX, boardY + cellSize);
    ctx.lineTo(boardX + boardSize, boardY + cellSize);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(boardX, boardY + cellSize * 2);
    ctx.lineTo(boardX + boardSize, boardY + cellSize * 2);
    ctx.stroke();
    
    // Символы X и O
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // X
    ctx.fillStyle = '#ffffff';
    ctx.fillText('X', boardX + cellSize * 0.5, boardY + cellSize * 0.5);
    
    // O
    ctx.fillStyle = '#e94560';
    ctx.fillText('O', boardX + cellSize * 1.5, boardY + cellSize * 1.5);
    
    // Конвертируем в PNG
    const buffer = canvas.toBuffer('image/png');
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    
    return res.status(200).send(buffer);
    
  } catch (error) {
    console.error('Splash PNG generation error:', error);
    
    // Fallback - простая ошибка
    try {
      const canvas = createCanvas(200, 200);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, 200, 200);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🎮', 100, 100);
      
      const buffer = canvas.toBuffer('image/png');
      res.setHeader('Content-Type', 'image/png');
      return res.status(200).send(buffer);
    } catch (fallbackError) {
      res.status(500).json({ error: 'Image generation failed' });
    }
  }
}

