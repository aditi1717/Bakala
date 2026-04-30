import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.resolve(__dirname, '../src/modules/Food/assets');
const EXTENSIONS = ['.png', '.jpg', '.jpeg'];

async function convertDir(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            await convertDir(fullPath);
        } else {
            const ext = path.extname(file).toLowerCase();
            if (EXTENSIONS.includes(ext)) {
                const webpPath = fullPath.replace(new RegExp(`${ext}$`, 'i'), '.webp');
                
                try {
                    console.log(`Converting: ${fullPath} -> ${webpPath}`);
                    await sharp(fullPath)
                        .webp({ quality: 80 })
                        .toFile(webpPath);
                    
                    // Delete original
                    // fs.unlinkSync(fullPath);
                    // console.log(`Deleted original: ${fullPath}`);
                } catch (err) {
                    console.error(`Failed to convert ${fullPath}:`, err.message);
                }
            }
        }
    }
}

console.log('Starting WebP conversion in:', ASSETS_DIR);
convertDir(ASSETS_DIR)
    .then(() => console.log('Conversion complete!'))
    .catch(err => console.error('Error during conversion:', err));
