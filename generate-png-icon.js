const fs = require('fs');
const { createCanvas } = require('canvas');

// Создаем PNG иконку 1024x1024
function generatePNGIcon() {
    const size = 1024;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const scale = size / 1024;
    
    // Очищаем canvas
    ctx.clearRect(0, 0, size, size);
    
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
    
    return canvas;
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

// Генерируем иконку
try {
    const canvas = generatePNGIcon();
    const buffer = canvas.toBuffer('image/png');
    
    // Сохраняем файл
    fs.writeFileSync('tictactoe-icon-1024x1024.png', buffer);
    console.log('✅ PNG иконка 1024x1024 успешно создана: tictactoe-icon-1024x1024.png');
    console.log(`📁 Размер файла: ${(buffer.length / 1024).toFixed(2)} KB`);
    
} catch (error) {
    console.error('❌ Ошибка при создании PNG иконки:', error.message);
    console.log('\n💡 Убедитесь, что установлен пакет canvas:');
    console.log('npm install canvas');
}
