import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.resolve(__dirname, '../src/modules/Food');
const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.css', '.scss'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg'];

function updateFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let hasChanged = false;

    IMAGE_EXTS.forEach(ext => {
        const regex = new RegExp(`\\.${ext}(?=['"\\)])`, 'gi');
        if (regex.test(content)) {
            content = content.replace(regex, '.webp');
            hasChanged = true;
        }
    });

    if (hasChanged) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walk(fullPath);
        } else if (EXTENSIONS.includes(path.extname(file).toLowerCase())) {
            updateFile(fullPath);
        }
    });
}

console.log('Updating image references in:', SRC_DIR);
walk(SRC_DIR);
console.log('Update complete!');
