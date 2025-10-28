// Vercel API endpoint для генерации PNG иконки

export default async function handler(req, res) {
  try {
    const { size = '1024' } = req.query;
    const iconSize = parseInt(size);
    
    // Поддерживаемые размеры для PNG
    const supportedSizes = [64, 128, 256, 512, 1024];
    const finalSize = supportedSizes.includes(iconSize) ? iconSize : 1024;
    
    // Генерируем HTML с SVG для конвертации в PNG
    const html = generateIconHTML(finalSize);
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
    
  } catch (error) {
    console.error('PNG Icon generation error:', error);
    return res.status(500).json({ error: 'Failed to generate PNG icon' });
  }
}

function generateIconHTML(size) {
  const scale = size / 1024;
  
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>TicTacToe Icon PNG Generator</title>
    <style>
        body { margin: 0; padding: 20px; background: #f0f0f0; font-family: Arial, sans-serif; }
        .container { max-width: 800px; margin: 0 auto; text-align: center; }
        #iconSvg { border: 1px solid #ddd; border-radius: 8px; }
        .download-btn { 
            background: #6200EA; color: white; border: none; 
            padding: 15px 30px; font-size: 16px; border-radius: 8px; 
            cursor: pointer; margin: 20px 10px; 
        }
        .download-btn:hover { background: #5000C7; }
        .info { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎨 TicTacToe PNG Icon Generator</h1>
        
        <div class="info">
            <h3>Размер: ${size}x${size} пикселей</h3>
            <p>Нажмите кнопку ниже, чтобы скачать PNG версию иконки</p>
        </div>
        
        <svg id="iconSvg" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#6200EA;stop-opacity:1" />
                    <stop offset="25%" style="stop-color:#7c3aed;stop-opacity:1" />
                    <stop offset="50%" style="stop-color:#8b5cf6;stop-opacity:1" />
                    <stop offset="75%" style="stop-color:#6366f1;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#1a1a2e;stop-opacity:1" />
                </linearGradient>
                
                <radialGradient id="bgRadial" cx="30%" cy="30%" r="80%">
                    <stop offset="0%" style="stop-color:#8b5cf6;stop-opacity:0.8" />
                    <stop offset="50%" style="stop-color:#6200EA;stop-opacity:0.9" />
                    <stop offset="100%" style="stop-color:#1a1a2e;stop-opacity:1" />
                </radialGradient>
                
                <linearGradient id="xGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                    <stop offset="50%" style="stop-color:#ff5252;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#e94560;stop-opacity:1" />
                </linearGradient>
                
                <linearGradient id="oGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:1" />
                    <stop offset="50%" style="stop-color:#26d0ce;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#45b7b8;stop-opacity:1" />
                </linearGradient>
                
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="${16 * scale}" stdDeviation="${24 * scale}" flood-color="#000000" flood-opacity="0.4"/>
                </filter>
                
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="${4 * scale}" result="coloredBlur"/>
                    <feMerge> 
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
                
                <pattern id="texture" patternUnits="userSpaceOnUse" width="${4 * scale}" height="${4 * scale}">
                    <rect width="${4 * scale}" height="${4 * scale}" fill="#ffffff" opacity="0.02"/>
                    <circle cx="${2 * scale}" cy="${2 * scale}" r="${0.5 * scale}" fill="#ffffff" opacity="0.05"/>
                </pattern>
            </defs>
            
            <!-- Основной фон -->
            <rect x="0" y="0" width="${size}" height="${size}" rx="${180 * scale}" ry="${180 * scale}" fill="url(#bgGradient)" filter="url(#shadow)"/>
            <rect x="0" y="0" width="${size}" height="${size}" rx="${180 * scale}" ry="${180 * scale}" fill="url(#bgRadial)" opacity="0.7"/>
            <rect x="0" y="0" width="${size}" height="${size}" rx="${180 * scale}" ry="${180 * scale}" fill="url(#texture)"/>
            
            <!-- Рамки -->
            <rect x="${40 * scale}" y="${40 * scale}" width="${944 * scale}" height="${944 * scale}" rx="${140 * scale}" ry="${140 * scale}" fill="none" stroke="#ffffff" stroke-width="${4 * scale}" opacity="0.4"/>
            
            <!-- Игровая сетка -->
            <g transform="translate(${212 * scale}, ${212 * scale})">
                <!-- Свечение линий -->
                <line x1="${200 * scale}" y1="${40 * scale}" x2="${200 * scale}" y2="${560 * scale}" stroke="#ffffff" stroke-width="${20 * scale}" stroke-linecap="round" opacity="0.3"/>
                <line x1="${400 * scale}" y1="${40 * scale}" x2="${400 * scale}" y2="${560 * scale}" stroke="#ffffff" stroke-width="${20 * scale}" stroke-linecap="round" opacity="0.3"/>
                <line x1="${40 * scale}" y1="${200 * scale}" x2="${560 * scale}" y2="${200 * scale}" stroke="#ffffff" stroke-width="${20 * scale}" stroke-linecap="round" opacity="0.3"/>
                <line x1="${40 * scale}" y1="${400 * scale}" x2="${560 * scale}" y2="${400 * scale}" stroke="#ffffff" stroke-width="${20 * scale}" stroke-linecap="round" opacity="0.3"/>
                
                <!-- Основные линии -->
                <line x1="${200 * scale}" y1="${40 * scale}" x2="${200 * scale}" y2="${560 * scale}" stroke="#ffffff" stroke-width="${16 * scale}" stroke-linecap="round" opacity="0.95"/>
                <line x1="${400 * scale}" y1="${40 * scale}" x2="${400 * scale}" y2="${560 * scale}" stroke="#ffffff" stroke-width="${16 * scale}" stroke-linecap="round" opacity="0.95"/>
                <line x1="${40 * scale}" y1="${200 * scale}" x2="${560 * scale}" y2="${200 * scale}" stroke="#ffffff" stroke-width="${16 * scale}" stroke-linecap="round" opacity="0.95"/>
                <line x1="${40 * scale}" y1="${400 * scale}" x2="${560 * scale}" y2="${400 * scale}" stroke="#ffffff" stroke-width="${16 * scale}" stroke-linecap="round" opacity="0.95"/>
                
                <!-- Символы -->
                <text x="${120 * scale}" y="${120 * scale}" fill="url(#xGradient)" font-family="Arial" font-size="${120 * scale}" font-weight="900" text-anchor="middle" dominant-baseline="central" filter="url(#glow)">X</text>
                <text x="${500 * scale}" y="${120 * scale}" fill="url(#oGradient)" font-family="Arial" font-size="${100 * scale}" font-weight="900" text-anchor="middle" dominant-baseline="central" filter="url(#glow)">O</text>
                <text x="${300 * scale}" y="${300 * scale}" fill="url(#xGradient)" font-family="Arial" font-size="${120 * scale}" font-weight="900" text-anchor="middle" dominant-baseline="central" filter="url(#glow)">X</text>
                <text x="${120 * scale}" y="${480 * scale}" fill="url(#oGradient)" font-family="Arial" font-size="${100 * scale}" font-weight="900" text-anchor="middle" dominant-baseline="central" filter="url(#glow)">O</text>
                <text x="${500 * scale}" y="${480 * scale}" fill="url(#xGradient)" font-family="Arial" font-size="${120 * scale}" font-weight="900" text-anchor="middle" dominant-baseline="central" filter="url(#glow)">X</text>
                
                <!-- Выигрышная линия -->
                <line x1="${70 * scale}" y1="${70 * scale}" x2="${530 * scale}" y2="${530 * scale}" stroke="url(#xGradient)" stroke-width="${20 * scale}" stroke-linecap="round" opacity="0.4"/>
                <line x1="${70 * scale}" y1="${70 * scale}" x2="${530 * scale}" y2="${530 * scale}" stroke="url(#xGradient)" stroke-width="${12 * scale}" stroke-linecap="round" opacity="0.9" filter="url(#glow)"/>
            </g>
            
            <!-- Декоративные элементы -->
            <ellipse cx="${360 * scale}" cy="${240 * scale}" rx="${80 * scale}" ry="${40 * scale}" fill="#ffffff" opacity="0.25" transform="rotate(-30 ${360 * scale} ${240 * scale})"/>
            <ellipse cx="${700 * scale}" cy="${400 * scale}" rx="${50 * scale}" ry="${25 * scale}" fill="#ffffff" opacity="0.2" transform="rotate(45 ${700 * scale} ${400 * scale})"/>
            
            <!-- Подпись -->
            <text x="${size / 2}" y="${960 * scale}" fill="#ffffff" font-family="Arial" font-size="${32 * scale}" font-weight="bold" text-anchor="middle" opacity="0.8">TicTacToe</text>
        </svg>
        
        <div>
            <button class="download-btn" onclick="downloadPNG()">📥 Скачать PNG ${size}x${size}</button>
            <button class="download-btn" onclick="copyImageUrl()">🔗 Копировать как Data URL</button>
        </div>
        
        <div class="info">
            <p><strong>Прямая ссылка на PNG:</strong></p>
            <code>https://your-domain.com/api/icon-png?size=${size}</code>
        </div>
    </div>
    
    <script>
        function downloadPNG() {
            const svg = document.getElementById('iconSvg');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = ${size};
            canvas.height = ${size};
            
            const data = new XMLSerializer().serializeToString(svg);
            const img = new Image();
            
            img.onload = function() {
                ctx.drawImage(img, 0, 0);
                
                canvas.toBlob(function(blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'tictactoe-icon-${size}x${size}.png';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 'image/png');
            };
            
            const svgBlob = new Blob([data], {type: 'image/svg+xml;charset=utf-8'});
            const url = URL.createObjectURL(svgBlob);
            img.src = url;
        }
        
        function copyImageUrl() {
            const svg = document.getElementById('iconSvg');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = ${size};
            canvas.height = ${size};
            
            const data = new XMLSerializer().serializeToString(svg);
            const img = new Image();
            
            img.onload = function() {
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                
                navigator.clipboard.writeText(dataUrl).then(function() {
                    alert('Data URL скопирован в буфер обмена!');
                }).catch(function(err) {
                    console.error('Ошибка копирования: ', err);
                });
            };
            
            const svgBlob = new Blob([data], {type: 'image/svg+xml;charset=utf-8'});
            const url = URL.createObjectURL(svgBlob);
            img.src = url;
        }
    </script>
</body>
</html>`;
}
