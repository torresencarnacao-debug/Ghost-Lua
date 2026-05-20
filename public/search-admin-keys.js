const fs = require('fs');
const html = fs.readFileSync('admin.html', 'utf-8');
const lines = html.split('\n');
lines.forEach((line, index) => {
    if (line.includes('key') || line.includes('clé') || line.includes('licence') || line.includes('table') || line.includes('recherch')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
