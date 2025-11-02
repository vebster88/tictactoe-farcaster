// Vercel API endpoint для генерации OG изображения (3:2 aspect ratio) для fc:miniapp embed
// Требования: 600x400px минимум, 3:2 aspect ratio, PNG/JPG формат

import { createCanvas } from 'canvas';

export default async function handler(req, res) {
  try {
    const width = 1200; // 3:2 aspect ratio
    const height = 800;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Фон с градиентом
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Игровое поле (центр)
    const boardSize = 300;
    const boardX = (width - boardSize) / 2;
    const boardY = (height - boardSize) / 2 - 50;
    
    // Фон игрового поля
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(boardX, boardY, boardSize, boardSize);
    
    // Рамка
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(boardX, boardY, boardSize, boardSize);
    
    // Сетка 3x3
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
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
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // X
    ctx.fillStyle = '#ffffff';
    ctx.fillText('X', boardX + cellSize * 0.5, boardY + cellSize * 0.5);
    ctx.fillText('X', boardX + cellSize * 1.5, boardY + cellSize * 1.5);
    ctx.fillText('X', boardX + cellSize * 2.5, boardY + cellSize * 2.5);
    
    // O
    ctx.fillStyle = '#e94560';
    ctx.fillText('O', boardX + cellSize * 2.5, boardY + cellSize * 0.5);
    ctx.fillText('O', boardX + cellSize * 0.5, boardY + cellSize * 2.5);
    
    // Заголовок
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🎮 Krestiki Noliki', width / 2, boardY + boardSize + 80);
    
    // Подзаголовок
    ctx.font = '24px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText('Play in Farcaster', width / 2, boardY + boardSize + 120);
    
    // Конвертируем в PNG
    const buffer = canvas.toBuffer('image/png');
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    
    return res.status(200).send(buffer);
    
  } catch (error) {
    console.error('OG Image generation error:', error);
    
    // Fallback - простая ошибка
    try {
      const canvas = createCanvas(1200, 800);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, 1200, 800);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Krestiki Noliki', 600, 400);
      
      const buffer = canvas.toBuffer('image/png');
      res.setHeader('Content-Type', 'image/png');
      return res.status(200).send(buffer);
    } catch (fallbackError) {
      res.status(500).json({ error: 'Image generation failed' });
    }
  }
}

