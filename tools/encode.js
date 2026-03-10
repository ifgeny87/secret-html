#!/usr/bin/env node

/**
 * Генерация пазл-файла с несколькими секретами.
 *
 * Использование:
 *   node encode.js <кол-во комбинаций> <выходной.json> <файл1> <фраза1> [<файл2> <фраза2> ...]
 *
 * Фраза: русские буквы, четная длина, 6-20 символов, без повторяющихся пар.
 * Все фразы должны быть разными. Комбинации уникальные, минимум = (все пары из фраз) + 3.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var RUSSIAN = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';

var args = process.argv.slice(2);
if (args.length < 4 || args.length % 2 === 1) {
    console.error('Использование: node encode.js <кол-во комбинаций> <выходной.json> <файл1> <фраза1> [<файл2> <фраза2> ...]');
    console.error('Фраза: русские буквы, четная длина, 6-20 символов, без повторяющихся пар');
    process.exit(1);
}

var comboCountArg = parseInt(args[0], 10);
var outputPath = path.resolve(args[1]);

var pairs = [];
for (var i = 2; i < args.length; i += 2) {
    pairs.push({ file: args[i], phrase: args[i + 1].toUpperCase() });
}

function validatePhrase(phrase) {
    if (phrase.length < 6 || phrase.length > 20 || phrase.length % 2 !== 0) {
        return 'фраза должна быть четной длины, от 6 до 20 символов';
    }
    for (var i = 0; i < phrase.length; i++) {
        if (RUSSIAN.indexOf(phrase[i]) === -1) {
            return 'фраза должна содержать только русские буквы';
        }
    }
    var phrasePairs = [];
    for (var j = 0; j < phrase.length; j += 2) {
        phrasePairs.push(phrase.substring(j, j + 2));
    }
    var seen = {};
    for (var k = 0; k < phrasePairs.length; k++) {
        if (seen[phrasePairs[k]]) {
            return 'в фразе есть повторяющиеся пары: ' + phrasePairs[k];
        }
        seen[phrasePairs[k]] = true;
    }
    return null;
}

var phraseSet = {};
for (var p = 0; p < pairs.length; p++) {
    var err = validatePhrase(pairs[p].phrase);
    if (err) {
        console.error(`Ошибка (фраза "${pairs[p].phrase}"):`, err);
        process.exit(1);
    }
    if (phraseSet[pairs[p].phrase]) {
        console.error('Ошибка: фразы не должны повторяться. Дубликат:', pairs[p].phrase);
        process.exit(1);
    }
    phraseSet[pairs[p].phrase] = true;
}

var allPairsSet = {};
for (var q = 0; q < pairs.length; q++) {
    var ph = pairs[q].phrase;
    for (var r = 0; r < ph.length; r += 2) {
        allPairsSet[ph.substring(r, r + 2)] = true;
    }
}
var uniquePairList = Object.keys(allPairsSet);
var minCombos = uniquePairList.length + 3;

if (isNaN(comboCountArg) || comboCountArg < minCombos) {
    console.error(`Ошибка: количество комбинаций должно быть не менее ${minCombos} (уникальных пар из фраз: ${uniquePairList.length}, плюс минимум 3 дополнительные)`);
    process.exit(1);
}

function randomPair() {
    var a = RUSSIAN[Math.floor(Math.random() * RUSSIAN.length)];
    var b = RUSSIAN[Math.floor(Math.random() * RUSSIAN.length)];
    return a + b;
}

var combos = uniquePairList.slice();
var existing = {};
for (var s = 0; s < combos.length; s++) existing[combos[s]] = true;

while (combos.length < comboCountArg) {
    var pair = randomPair();
    if (!existing[pair]) {
        combos.push(pair);
        existing[pair] = true;
    }
}

for (var t = combos.length - 1; t > 0; t--) {
    var u = Math.floor(Math.random() * (t + 1));
    var tmp = combos[t];
    combos[t] = combos[u];
    combos[u] = tmp;
}

// --- Хеш (4x djb2) ---

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

function encrypt(text, keyBytes) {
    return rc4(keyBytes, Buffer.from(text, 'utf-8')).toString('base64');
}

var items = [];

for (var idx = 0; idx < pairs.length; idx++) {
    var html;
    try {
        html = fs.readFileSync(path.resolve(pairs[idx].file), 'utf-8');
    } catch (e) {
        console.error('Ошибка чтения файла:', pairs[idx].file, e.message);
        process.exit(1);
    }
    var key = deriveKey(pairs[idx].phrase);
    var base64 = encrypt(html, key.bytes);
    var decCheck = rc4(key.bytes, Buffer.from(base64, 'base64')).toString('utf-8');
    if (decCheck !== html) {
        console.error('Ошибка верификации шифрования для', pairs[idx].file);
        process.exit(1);
    }
    items.push(key.hex + base64);
}

var output = { c: combos.join(''), items: items };

try {
    fs.writeFileSync(outputPath, JSON.stringify(output), 'utf-8');
} catch (e) {
    console.error('Ошибка записи файла:', e.message);
    process.exit(1);
}

console.log('Комбинаций:', combos.length);
console.log('Секретов:', items.length);
console.log('Записано в', outputPath);
