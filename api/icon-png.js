// Vercel API endpoint для генерации PNG иконки

export default async function handler(req, res) {
  try {
    const { size = '512' } = req.query;
    const iconSize = parseInt(size);
    
    // Поддерживаемые размеры
    const supportedSizes = [16, 32, 48, 64, 96, 128, 192, 256, 512, 1024];
    const finalSize = supportedSizes.includes(iconSize) ? iconSize : 512;
    
    // Генерируем PNG через HTML Canvas
    const pngDataUrl = await generatePNGIcon(finalSize);
    
    // Извлекаем base64 данные
    const base64Data = pngDataUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 часа
    res.setHeader('Content-Disposition', `inline; filename="tictactoe-icon-${finalSize}.png"`);
    
    return res.status(200).send(buffer);
    
  } catch (error) {
    console.error('PNG Icon generation error:', error);
    
    // Fallback - возвращаем HTML страницу для генерации PNG
    const fallbackHTML = generateFallbackPNG(req.query.size || '512');
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(fallbackHTML);
  }
}

async function generatePNGIcon(size) {
  // Используем jsdom для server-side canvas
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <canvas id="canvas" width="${size}" height="${size}"></canvas>
        <script>
          ${generateIconScript()}
        </script>
      </body>
    </html>
  `);
  
  const canvas = dom.window.document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  
  // Генерируем иконку
  drawIcon(ctx, size);
  
  return canvas.toDataURL('image/png');
}

function generateIconScript() {
  return `
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
      ctx.font = \`900 \${120 * scale}px Arial\`;
      
      // X символы
      ctx.fillStyle = xGradient;
      ctx.fillText('X', 120 * scale, 120 * scale);
      ctx.fillText('X', 300 * scale, 300 * scale);
      ctx.fillText('X', 500 * scale, 480 * scale);
      
      // O символы
      ctx.font = \`900 \${100 * scale}px Arial\`;
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
      ctx.font = \`bold \${32 * scale}px Arial\`;
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
    
    // Запускаем генерацию
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const size = parseInt('${size}');
    drawIcon(ctx, size);
  `;
}

function generateFallbackPNG(size) {
  const iconSize = parseInt(size) || 512;
  
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TicTacToe Icon PNG ${iconSize}x${iconSize}</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #6200EA, #1a1a2e);
            color: white;
            text-align: center;
            min-height: 100vh;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 20px;
        }
        #iconCanvas {
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            max-width: 100%;
            height: auto;
        }
        .download-btn {
            background: linear-gradient(135deg, #ff6b6b, #e94560);
            color: white;
            border: none;
            padding: 15px 30px;
            font-size: 16px;
            font-weight: bold;
            border-radius: 12px;
            cursor: pointer;
            margin: 20px;
            transition: all 0.3s ease;
        }
        .download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(233, 69, 96, 0.4);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎨 TicTacToe Icon PNG ${iconSize}×${iconSize}</h1>
        <canvas id="iconCanvas" width="${iconSize}" height="${iconSize}" style="width: 300px; height: 300px;"></canvas>
        <br>
        <button class="download-btn" onclick="downloadPNG()">📥 Скачать PNG ${iconSize}×${iconSize}</button>
    </div>
    
    <script>
        const canvas = document.getElementById('iconCanvas');
        const ctx = canvas.getContext('2d');
        const size = ${iconSize};
        
        // Генерируем иконку
        generateIcon();
        
        function generateIcon() {
            const scale = size / 1024;
            
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
            roundRect(ctx, 0, 0, size, size, 180 * scale);
            ctx.fill();
            
            // Рамка
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 4 * scale;
            roundRect(ctx, 40 * scale, 40 * scale, 944 * scale, 944 * scale, 140 * scale);
            ctx.stroke();
            
            // Сетка
            ctx.save();
            ctx.translate(212 * scale, 212 * scale);
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.lineWidth = 16 * scale;
            ctx.lineCap = 'round';
            
            // Линии
            ctx.beginPath();
            ctx.moveTo(200 * scale, 40 * scale); ctx.lineTo(200 * scale, 560 * scale);
            ctx.moveTo(400 * scale, 40 * scale); ctx.lineTo(400 * scale, 560 * scale);
            ctx.moveTo(40 * scale, 200 * scale); ctx.lineTo(560 * scale, 200 * scale);
            ctx.moveTo(40 * scale, 400 * scale); ctx.lineTo(560 * scale, 400 * scale);
            ctx.stroke();
            
            // Символы
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // X
            ctx.font = \`900 \${120 * scale}px Arial\`;
            ctx.fillStyle = xGradient;
            ctx.fillText('X', 120 * scale, 120 * scale);
            ctx.fillText('X', 300 * scale, 300 * scale);
            ctx.fillText('X', 500 * scale, 480 * scale);
            
            // O
            ctx.font = \`900 \${100 * scale}px Arial\`;
            ctx.fillStyle = oGradient;
            ctx.fillText('O', 500 * scale, 120 * scale);
            ctx.fillText('O', 120 * scale, 480 * scale);
            
            // Линия
            ctx.strokeStyle = xGradient;
            ctx.lineWidth = 12 * scale;
            ctx.beginPath();
            ctx.moveTo(70 * scale, 70 * scale);
            ctx.lineTo(530 * scale, 530 * scale);
            ctx.stroke();
            
            ctx.restore();
            
            // Подпись
            if (size >= 128) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.font = \`bold \${32 * scale}px Arial\`;
                ctx.textAlign = 'center';
                ctx.fillText('TicTacToe', size / 2, 960 * scale);
            }
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
            link.download = \`tictactoe-icon-\${size}x\${size}.png\`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }
    </script>
</body>
</html>`;
}