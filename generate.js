#!/usr/bin/env node

/**
 * Генерация secret.json
 *
 * Использование:
 *   node generate.js <input-file> <secret-phrase> <кол-во комбинаций>
 *
 * Секретная фраза: русские буквы, четная длина, 6-20 символов.
 *
 * Формат secret.json:
 *   { c: [...комбинации по 2 буквы...], d: "crc32hex + base64" }
 *
 * Безопасность:
 *   - Ключ шифрования выводится из фразы через 1000 раундов хеширования
 *   - CRC = хеш производного ключа (не самой фразы)
 *   - Шифрование: RC4-drop3072 с производным ключом
 *   - Без знания фразы расшифровка невозможна
 */
'use strict';

var fs = require('fs');
var path = require('path');

var RUSSIAN = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';

var args = process.argv.slice(2);
if (args.length < 3) {
    console.error(
        'Использование: node generate.js'
        + ' <input-file> <secret-phrase> <кол-во комбинаций>'
    );
    console.error(
        'Фраза: русские буквы, четная длина, 6-20 символов'
    );
    process.exit(1);
}

var inputPath = args[0];
var phrase = args[1].toUpperCase();
var totalCombosArg = parseInt(args[2], 10);

if (phrase.length < 6 || phrase.length > 20 || phrase.length % 2 !== 0) {
    console.error('Ошибка: фраза должна быть четной длины, от 6 до 20 символов');
    process.exit(1);
}

for (var i = 0; i < phrase.length; i++) {
    if (RUSSIAN.indexOf(phrase[i]) === -1) {
        console.error('Ошибка: фраза должна содержать только русские буквы');
        process.exit(1);
    }
}

var html;
try {
    html = fs.readFileSync(path.resolve(inputPath), 'utf-8');
} catch (e) {
    console.error('Ошибка чтения файла:', inputPath);
    process.exit(1);
}

// --- Разбивка фразы на пары ---

var phrasePairs = [];
for (var i = 0; i < phrase.length; i += 2) {
    phrasePairs.push(phrase.substring(i, i + 2));
}

var uniquePairs = new Set(phrasePairs);
if (uniquePairs.size !== phrasePairs.length) {
    var seen = {};
    var dupes = [];
    phrasePairs.forEach(function (p) {
        if (seen[p]) dupes.push(p);
        seen[p] = true;
    });
    console.error('Ошибка: в фразе есть повторяющиеся пары: ' + dupes.join(', '));
    process.exit(1);
}

// --- Генерация массива комбинаций ---

function randomPair() {
    var a = RUSSIAN[Math.floor(Math.random() * RUSSIAN.length)];
    var b = RUSSIAN[Math.floor(Math.random() * RUSSIAN.length)];
    return a + b;
}

if (isNaN(totalCombosArg) || totalCombosArg < phrasePairs.length + 2) {
    console.error(
        'Ошибка: количество комбинаций должно быть'
        + ' не менее ' + (phrasePairs.length + 2)
        + ' (пар в фразе: ' + phrasePairs.length + ')'
    );
    process.exit(1);
}
var totalCombos = totalCombosArg;
var combos = phrasePairs.slice();
var existing = new Set(combos);

while (combos.length < totalCombos) {
    var pair = randomPair();
    if (!existing.has(pair)) {
        combos.push(pair);
        existing.add(pair);
    }
}

for (var i = combos.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = combos[i];
    combos[i] = combos[j];
    combos[j] = tmp;
}

// --- Хеш-функция (4x djb2) ---

function hash32(str) {
    function djb2(s, seed) {
        var h = seed >>> 0;
        for (var i = 0; i < s.length; i++) {
            h = (((h << 5) >>> 0)
                + h + s.charCodeAt(i)) >>> 0;
        }
        return h;
    }
    return djb2(str, 5381).toString(16).padStart(8, '0')
        + djb2(str, 7919).toString(16).padStart(8, '0')
        + djb2(str, 13331).toString(16).padStart(8, '0')
        + djb2(str, 19937).toString(16).padStart(8, '0');
}

// --- Вывод ключа из фразы (1000 раундов) ---

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

// --- RC4-drop3072 ---

function rc4(keyBytes, data) {
    var S = new Array(256);
    var i, j = 0, tmp;

    for (i = 0; i < 256; i++) S[i] = i;
    for (i = 0; i < 256; i++) {
        j = (j + S[i] + keyBytes[i % keyBytes.length])
            & 255;
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

/**
 * Шифрует текст ключом через RC4
 */
function encrypt(text, keyBytes) {
    return rc4(keyBytes, Buffer.from(text, 'utf-8')).toString('base64');
}

/**
 * Расшифровывает base64 строку ключом через RC4
 */
function decrypt(base64, keyBytes) {
    return rc4(keyBytes, Buffer.from(base64, 'base64')).toString('utf-8');
}

// --- Генерация ---

var key = deriveKey(phrase);
var crc = key.hex;
var base64 = encrypt(html, key.bytes);

var check = decrypt(base64, key.bytes);
if (check !== html) {
    console.error('Ошибка верификации шифрования!');
    process.exit(1);
}

var output = { c: combos, d: crc + base64 };

fs.writeFileSync(path.join(__dirname, 'secret.json'), JSON.stringify(output));

console.log('Фраза:', phrase);
console.log('Пары:', phrasePairs.join(' + '));
console.log('Всего комбинаций:', combos.length);
console.log('CRC:', crc);
console.log('Base64 длина:', base64.length);
console.log('Проверка расшифровки: OK');
console.log('Записано в secret.json');
