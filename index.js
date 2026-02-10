const express = require('express');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { execSync } = require('child_process');
require('dotenv').config();

const app = express();
let browser;
const PORT = process.env.PORT || 3000;
const CHR_PATH = process.env.CHR_PATH || findChromePath();
const BOT_NAME = process.env.BOT_NAME || 'BotKu';
const folderPath = path.join(__dirname, 'hasil_screen');

// Pastikan folder ada
if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
}

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/hasil_screen', express.static(folderPath));
app.use('/capture-result', express.static(folderPath));

/**
 * Fungsi cari lokasi Chrome/Chromium otomatis di server
 */
function findChromePath() {
    const candidates = [
        'google-chrome-stable',
        'google-chrome',
        'chromium-browser',
        'chromium'
    ];

    for (const cmd of candidates) {
        try {
            const path = execSync(`which ${cmd}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
            if (path) return path;
        } catch (e) { }
    }
    throw new Error('❌ Chrome/Chromium tidak ditemukan di server. Silakan install terlebih dahulu.');
}

(async () => {
    try {
        const CHROME_PATH = CHR_PATH;
        console.log(`✅ Chrome ditemukan: ${CHROME_PATH}`);

        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        console.log('✅ Browser global siap digunakan');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
})();

app.get('/capture', async (req, res) => {
    try {
        if (!browser) {
            return res.status(500).json({ status: false, message: 'Browser belum siap' });
        }

        const url = req.query.url;
        const nama_file = req.query.filename || `capture_${Date.now()}`;

        console.log(`📸 Memulai screenshot: ${url}`);

        const page = await browser.newPage();

        await page.setCacheEnabled(false);
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        await page.setViewport({
            width: 1200,
            height: 900,
            deviceScaleFactor: 2
        });

        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        await client.send('Network.clearBrowserCookies');
        await client.send('Network.clearBrowserCache');
        await client.send('Network.setBypassServiceWorker', { bypass: true });

        await page.goto(url, { waitUntil: 'domcontentloaded' });

        await page.waitForSelector('#capture', { visible: true });
        await page.waitForFunction(() => {
            const el = document.querySelector('#capture');
            return el && el.offsetHeight > 100;
        });

        const fileName = `${nama_file}.png`;
        const savePath = path.join(folderPath, fileName);

        const element = await page.$('#capture');
        await element.screenshot({ path: savePath });

        await page.close();

        console.log('✅ Screenshot berhasil:', savePath);
        res.json({ status: true, file: fileName });

    } catch (error) {
        console.error('❌ Gagal mengambil screenshot:', error);
        res.status(500).json({ status: false, error: error.toString() });
    }
});


process.on('SIGINT', async () => {
    if (browser) {
        await browser.close();
        console.log('🛑 Browser ditutup');
    }
    process.exit();
});
// Endpoint daftar screenshot
app.get('/screens', (req, res) => {
    const files = fs.readdirSync(folderPath).map(file => ({
        name: file,
        url: `/hasil_screen/${file}`
    }));
    res.json(files);
});

// Hapus 1 file
app.delete('/delete/:filename', (req, res) => {
    const filePath = path.join(folderPath, req.params.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ status: true, message: 'File dihapus' });
    } else {
        res.status(404).json({ status: false, message: 'File tidak ditemukan' });
    }
});

// Hapus semua file
app.delete('/delete-all', (req, res) => {
    fs.readdirSync(folderPath).forEach(file => {
        fs.unlinkSync(path.join(folderPath, file));
    });
    res.json({ status: true, message: 'Semua file dihapus' });
});

app.listen(PORT, () => console.log(`🚀 Server berjalan di port ${PORT}`));
