const fs = require('fs');
const path = require('path');
const https = require('https');

// Read .env file to find VITE_GOOGLE_API_KEY
const envPath = path.join(__dirname, '.env');
let apiKey = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/VITE_GOOGLE_API_KEY=(.*)/);
    if (match && match[1]) {
        apiKey = match[1].trim();
    }
} catch (e) {
    console.log('Could not read .env file:', e.message);
}

if (!apiKey) {
    console.error('No VITE_GOOGLE_API_KEY found in .env');
    process.exit(1);
}

console.log('Found API Key (first 5 chars):', apiKey.substring(0, 5) + '...');

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        if (res.statusCode !== 200) {
            console.error(`Error: Status Code ${res.statusCode}`);
            console.error('Response:', data);
        } else {
            try {
                const json = JSON.parse(data);
                console.log('Available Models:');
                if (json.models) {
                    json.models.forEach(m => {
                        if (m.name.includes('gemini')) {
                            console.log(`- ${m.name} (methods: ${m.supportedGenerationMethods})`);
                        }
                    });
                } else {
                    console.log('No models found in response.');
                }
            } catch (e) {
                console.error('Error parsing JSON:', e.message);
            }
        }
    });
}).on('error', (e) => {
    console.error('Error making request:', e.message);
});
