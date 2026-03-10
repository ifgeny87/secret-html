#!/usr/bin/env node

/**
 * Расшифровка нескольких секретов из пазл-файла.
 *
 * Использование:
 *   node decode.js <пазл-файл.json> <фраза1> <выход1> [<фраза2> <выход2> ...]
 *
 * Для каждой пары (фраза, файл): ищется секрет с подходящим CRC, расшифровывается и пишется в файл.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var args = process.argv.slice(2);
if (args.length < 3 || args.length % 2 !== 1) {
    console.error(
        'Использование: node decode.js'
        + ' <пазл-файл.json> <фраза1> <выход1> [<фраза2> <выход2> ...]'
    );
    process.exit(1);
}

var puzzlePath = path.resolve(args[0]);

var json;
try {
    json = JSON.parse(fs.readFileSync(puzzlePath, 'utf-8'));
} catch (e) {
    console.error('Ошибка чтения пазл-файла:', e.message);
    process.exit(1);
}

if (typeof json.c !== 'string' || !Array.isArray(json.items)) {
    console.error('Ошибка: в пазл-файле должны быть поле c (строка) и items (массив строк)');
    process.exit(1);
}

var items = json.items;

function hash32(str) {
    function djb2(s, seed) {
        var h = seed >>> 0;
        for (var i = 0; i < s.length; i++) {
            h = (((h << 5) >>> 0) + h + s.charCodeAt(i)) >>> 0;
        }
        return h;
    }
    return djb2(str, 5381).toString(16).padStart(8, '0')
        + djb2(str, 7919).toString(16).padStart(8, '0')
        + djb2(str, 13331).toString(16).padStart(8, '0')
        + djb2(str, 19937).toString(16).padStart(8, '0');
}

function deriveKey(phrase) {
    var h = phrase;
    for (var i = 0; i < 1000; i++) {
        h = hash32(h + phrase);
    }
    var bytes = [];
    for (var i = 0; i < 32; i += 2) {
        bytes.push(parseInt(h.substring(i, i + 2), 16));
    }
    return { hex: h, bytes: bytes };
}

function rc4(keyBytes, data) {
    var S = new Array(256);
    var i, j = 0, tmp;

    for (i = 0; i < 256; i++) S[i] = i;
    for (i = 0; i < 256; i++) {
        j = (j + S[i] + keyBytes[i % keyBytes.length]) & 255;
        tmp = S[i]; S[i] = S[j]; S[j] = tmp;
    }
    var a = 0, b = 0;
    for (i = 0; i < 3072; i++) {
        a = (a + 1) & 255;
        b = (b + S[a]) & 255;
        tmp = S[a]; S[a] = S[b]; S[b] = tmp;
    }
    var result = Buffer.alloc(data.length);
    for (i = 0; i < data.length; i++) {
        a = (a + 1) & 255;
        b = (b + S[a]) & 255;
        tmp = S[a]; S[a] = S[b]; S[b] = tmp;
        result[i] = data[i] ^ S[(S[a] + S[b]) & 255];
    }
    return result;
}

function decrypt(base64, keyBytes) {
    return rc4(keyBytes, Buffer.from(base64, 'base64')).toString('utf-8');
}

for (var j = 1; j < args.length; j += 2) {
    var phrase = args[j].toUpperCase();
    var outPath = path.resolve(args[j + 1]);

    var key = deriveKey(phrase);
    var found = null;
    for (var k = 0; k < items.length; k++) {
        var s = items[k];
        if (typeof s === 'string' && s.length >= 32 && s.substring(0, 32) === key.hex) {
            found = s;
            break;
        }
    }

    if (!found) {
        console.error('Ошибка: кодовая фраза не подходит для одного из секретов');
        process.exit(1);
    }

    var content;
    try {
        content = decrypt(found.substring(32), key.bytes);
    } catch (e) {
        console.error('Ошибка расшифровки:', e.message);
        process.exit(1);
    }

    try {
        fs.writeFileSync(outPath, content, 'utf-8');
    } catch (e) {
        console.error('Ошибка записи файла', outPath + ':', e.message);
        process.exit(1);
    }

    console.log('Расшифровано в', outPath);
}
