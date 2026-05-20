const fs = require('fs');

const adminJs = fs.readFileSync('js/admin.js', 'utf-8');
const lines = adminJs.split('\n');
lines.forEach((line, index) => {
    if (line.includes('loadRailwayData') || line.includes('railway-keys-tbody') || line.includes('renderRailwayKeys')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
