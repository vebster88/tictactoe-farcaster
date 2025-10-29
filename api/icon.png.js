// Vercel API endpoint для прямой генерации PNG файла

export default async function handler(req, res) {
  try {
    // Создаем PNG через Canvas API (server-side)
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(1024, 1024);
    const ctx = canvas.getContext('2d');
    
    // Рисуем иконку
    drawIcon(ctx, 1024);
    
    // Возвращаем PNG
    const buffer = canvas.toBuffer('image/png');
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', 'inline; filename="tictactoe-icon-1024.png"');
    
    return res.status(200).send(buffer);
    
  } catch (error) {
    console.error('PNG generation error:', error);
    
    // Fallback - возвращаем простую PNG через Data URL
    const fallbackPNG = generateFallbackPNG();
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(fallbackPNG);
  }
}

function drawIcon(ctx, size) {
  const scale = size / 1024;
  
  // Создаем градиенты
  const bgGradient = ctx.createLinearGradient(0, 0, size, size);
  bgGradient.addColorStop(0, '#6200EA');
  bgGradient.addColorStop(0.25, '#7c3aed');
  bgGradient.addColorStop(0.5, '#8b5cf6');
  bgGradient.addColorStop(0.75, '#6366f1');
  bgGradient.addColorStop(1, '#1a1a2e');
  
  const xGradient = ctx.createLinearGradient(0, 0, size, size);
  xGradient.addColorStop(0, '#ff6b6b');
  xGradient.addColorStop(0.5, '#ff5252');
  xGradient.addColorStop(1, '#e94560');
  
  const oGradient = ctx.createLinearGradient(0, 0, size, size);
  oGradient.addColorStop(0, '#4ecdc4');
  oGradient.addColorStop(0.5, '#26d0ce');
  oGradient.addColorStop(1, '#45b7b8');
  
  // Рисуем фон с закругленными углами
  ctx.fillStyle = bgGradient;
  roundRect(ctx, 0, 0, size, size, 180 * scale);
  ctx.fill();
  
  // Рисуем рамку
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 4 * scale;
  roundRect(ctx, 40 * scale, 40 * scale, 944 * scale, 944 * scale, 140 * scale);
  ctx.stroke();
  
  // Рисуем сетку
  const gridOffset = 212 * scale;
  ctx.save();
  ctx.translate(gridOffset, gridOffset);
  
  // Линии сетки
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 16 * scale;
  ctx.lineCap = 'round';
  
  // Вертикальные линии
  ctx.beginPath();
  ctx.moveTo(200 * scale, 40 * scale);
  ctx.lineTo(200 * scale, 560 * scale);
  ctx.moveTo(400 * scale, 40 * scale);
  ctx.lineTo(400 * scale, 560 * scale);
  ctx.stroke();
  
  // Горизонтальные линии
  ctx.beginPath();
  ctx.moveTo(40 * scale, 200 * scale);
  ctx.lineTo(560 * scale, 200 * scale);
  ctx.moveTo(40 * scale, 400 * scale);
  ctx.lineTo(560 * scale, 400 * scale);
  ctx.stroke();
  
  // Рисуем символы
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${120 * scale}px Arial`;
  
  // X символы
  ctx.fillStyle = xGradient;
  ctx.fillText('X', 120 * scale, 120 * scale);
  ctx.fillText('X', 300 * scale, 300 * scale);
  ctx.fillText('X', 500 * scale, 480 * scale);
  
  // O символы
  ctx.font = `900 ${100 * scale}px Arial`;
  ctx.fillStyle = oGradient;
  ctx.fillText('O', 500 * scale, 120 * scale);
  ctx.fillText('O', 120 * scale, 480 * scale);
  
  // Выигрышная линия
  ctx.strokeStyle = xGradient;
  ctx.lineWidth = 12 * scale;
  ctx.beginPath();
  ctx.moveTo(70 * scale, 70 * scale);
  ctx.lineTo(530 * scale, 530 * scale);
  ctx.stroke();
  
  ctx.restore();
  
  // Подпись
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = `bold ${32 * scale}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('TicTacToe', size / 2, 960 * scale);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function generateFallbackPNG() {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>TicTacToe Icon PNG</title>
    <style>
        body { margin: 0; padding: 20px; font-family: Arial; text-align: center; background: #1a1a2e; color: white; }
        canvas { border: 2px solid #6200EA; border-radius: 8px; }
        .download-btn { background: #6200EA; color: white; border: none; padding: 15px 30px; font-size: 16px; border-radius: 8px; cursor: pointer; margin: 20px; }
    </style>
</head>
<body>
    <h1>🎨 TicTacToe Icon PNG</h1>
    <canvas id="icon" width="1024" height="1024"></canvas>
    <br>
    <button class="download-btn" onclick="downloadPNG()">📥 Скачать PNG 1024x1024</button>
    
    <script>
        const canvas = document.getElementById('icon');
        const ctx = canvas.getContext('2d');
        
        // Генерируем иконку
        generateIcon();
        
        function generateIcon() {
            const size = 1024;
            const scale = 1;
            
            // Градиенты
            const bgGradient = ctx.createLinearGradient(0, 0, size, size);
            bgGradient.addColorStop(0, '#6200EA');
            bgGradient.addColorStop(0.25, '#7c3aed');
            bgGradient.addColorStop(0.5, '#8b5cf6');
            bgGradient.addColorStop(0.75, '#6366f1');
            bgGradient.addColorStop(1, '#1a1a2e');
            
            const xGradient = ctx.createLinearGradient(0, 0, size, size);
            xGradient.addColorStop(0, '#ff6b6b');
            xGradient.addColorStop(0.5, '#ff5252');
            xGradient.addColorStop(1, '#e94560');
            
            const oGradient = ctx.createLinearGradient(0, 0, size, size);
            oGradient.addColorStop(0, '#4ecdc4');
            oGradient.addColorStop(0.5, '#26d0ce');
            oGradient.addColorStop(1, '#45b7b8');
            
            // Фон
            ctx.fillStyle = bgGradient;
            roundRect(ctx, 0, 0, size, size, 180);
            ctx.fill();
            
            // Рамка
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 4;
            roundRect(ctx, 40, 40, 944, 944, 140);
            ctx.stroke();
            
            // Сетка
            ctx.save();
            ctx.translate(212, 212);
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.lineWidth = 16;
            ctx.lineCap = 'round';
            
            // Линии
            ctx.beginPath();
            ctx.moveTo(200, 40); ctx.lineTo(200, 560);
            ctx.moveTo(400, 40); ctx.lineTo(400, 560);
            ctx.moveTo(40, 200); ctx.lineTo(560, 200);
            ctx.moveTo(40, 400); ctx.lineTo(560, 400);
            ctx.stroke();
            
            // Символы
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // X
            ctx.font = '900 120px Arial';
            ctx.fillStyle = xGradient;
            ctx.fillText('X', 120, 120);
            ctx.fillText('X', 300, 300);
            ctx.fillText('X', 500, 480);
            
            // O
            ctx.font = '900 100px Arial';
            ctx.fillStyle = oGradient;
            ctx.fillText('O', 500, 120);
            ctx.fillText('O', 120, 480);
            
            // Линия
            ctx.strokeStyle = xGradient;
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.moveTo(70, 70);
            ctx.lineTo(530, 530);
            ctx.stroke();
            
            ctx.restore();
            
            // Подпись
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('TicTacToe', 512, 960);
        }
        
        function roundRect(ctx, x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        }
        
        function downloadPNG() {
            const link = document.createElement('a');
            link.download = 'tictactoe-icon-1024x1024.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        }
    </script>
</body>
</html>`;
}

