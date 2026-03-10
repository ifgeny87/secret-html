#!/usr/bin/env node
/**
 * Тесты для encode.js и decode.js
 *
 * Два этапа:
 *   Этап 1 — работа с фикстурами (tests/fixtures/).
 *   Этап 2 — генерация 5 файлов секретов и работа с ними.
 *
 * Запуск:
 *   node run-tests.js [папка-временных-файлов] [удалять-после]
 */
'use strict';

var fs = require('fs');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var ROOT = path.resolve(__dirname, '..');
var FIXTURES_DIR = path.join(__dirname, 'fixtures');
var ENCODE = path.join(ROOT, 'tools', 'encode.js');
var DECODE = path.join(ROOT, 'tools', 'decode.js');

var tempDir = process.argv[2] || '.test-data';
var cleanup = /^(1|true|yes|да)$/i.test(String(process.argv[3] || ''));

if (!path.isAbsolute(tempDir)) {
    tempDir = path.join(ROOT, tempDir);
}

var results = [];
var testNum = 0;
var phrases = ['ПРИВЕТ', 'СЕКРЕТ', 'АБВГДЕЖЗ', 'ИКЛМНОПР', 'СТУФХЦЧШ'];

var FIXTURE_NAMES = [
    'secret1-empty.txt',
    'secret2.html',
    'secret3.json',
    'secret4.bin',
    'secret5-big.txt',
];

function printOneResult(r) {
    var status = r.ok ? 'OK' : 'ОШИБКА';
    console.log(r.num + '. ' + r.name + ' — ' + status + ' — ' + r.ms + ' мс');
    if (r.error) {
        console.log('   Сообщение: ' + r.error);
        if (r.details) {
            console.log('   Исходный файл: ' + r.details.origPath);
            console.log('   Полученный файл: ' + r.details.decPath);
            console.log('   Размер исходного: ' + r.details.lenOrig + ' байт');
            console.log('   Размер полученного: ' + r.details.lenDec + ' байт');
            console.log('   Первое расхождение на позиции: ' + r.details.firstDiff);
            console.log('   Hex исходного (около расхождения): ' + r.details.hexOrig);
            console.log('   Hex полученного (около расхождения): ' + r.details.hexDec);
        }
    }
}

function run(name, fn) {
    testNum += 1;
    var num = testNum;
    var start = Date.now();
    var err = null;
    try {
        fn();
    } catch (e) {
        err = e;
    }
    var elapsed = Date.now() - start;
    var r = {
        num: num,
        name: name,
        ms: elapsed,
        ok: !err,
        error: err ? err.message : null,
        details: err && err.details ? err.details : null,
    };
    results.push(r);
    printOneResult(r);
}

function assertBufferEqual(orig, dec, fileIndex, origPath, decPath) {
    if (Buffer.compare(orig, dec) === 0) return;
    var lenOrig = orig.length;
    var lenDec = dec.length;
    var firstDiff = -1;
    for (var i = 0; i < Math.min(lenOrig, lenDec); i++) {
        if (orig[i] !== dec[i]) { firstDiff = i; break; }
    }
    if (firstDiff === -1) firstDiff = Math.min(lenOrig, lenDec);
    var snippetOrig = orig.slice(Math.max(0, firstDiff - 8), firstDiff + 8);
    var snippetDec = dec.slice(Math.max(0, firstDiff - 8), firstDiff + 8);
    var e = new Error(
        'Файл ' + fileIndex + ' не совпадает с исходным. ' +
        'Исходный: ' + origPath + ' (размер ' + lenOrig + ' байт). ' +
        'Полученный: ' + decPath + ' (размер ' + lenDec + ' байт).' +
        (lenOrig !== lenDec ? ' Размеры различаются.' : '') +
        (firstDiff >= 0 ? ' Первое расхождение на позиции ' + firstDiff + '.' : '')
    );
    e.details = {
        origPath: origPath,
        decPath: decPath,
        lenOrig: lenOrig,
        lenDec: lenDec,
        firstDiff: firstDiff,
        hexOrig: snippetOrig.length ? snippetOrig.toString('hex') : '(нет)',
        hexDec: snippetDec.length ? snippetDec.toString('hex') : '(нет)',
    };
    throw e;
}

function encode(args) {
    var r = spawnSync('node', [ENCODE].concat(args), {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 60000,
    });
    return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function decode(args) {
    var r = spawnSync('node', [DECODE].concat(args), {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 60000,
    });
    return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function getFixturePaths() {
    var out = [];
    for (var i = 0; i < FIXTURE_NAMES.length; i++) {
        out.push(path.join(FIXTURES_DIR, FIXTURE_NAMES[i]));
    }
    return out;
}

function ensureFixtures() {
    if (!fs.existsSync(FIXTURES_DIR)) {
        fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    }
    var binPath = path.join(FIXTURES_DIR, 'secret4.bin');
    if (!fs.existsSync(binPath) || fs.statSync(binPath).size < 90) {
        var binParts = [];
        for (var i = 32; i <= 126; i++) binParts.push(String.fromCharCode(i));
        binParts.push('\t\n\r');
        fs.writeFileSync(
            binPath,
            binParts.join('') + '\nБайты 0x20-0x7E, таб, CR, LF.\n',
            'utf-8'
        );
    }
    var bigPath = path.join(FIXTURES_DIR, 'secret5-big.txt');
    if (!fs.existsSync(bigPath) || fs.statSync(bigPath).size < 10000) {
        var line = 'Большой файл для теста. Строка с данными. ';
        var size = 200 * 1024;
        var s = '';
        while (s.length < size) s += line;
        fs.writeFileSync(bigPath, s.substring(0, size), 'utf-8');
    }
}

function prepareGeneratedFiles() {
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    var files = [];
    var emptyFile = path.join(tempDir, 'gen1-empty.txt');
    fs.writeFileSync(emptyFile, '', 'utf-8');
    files.push(emptyFile);

    var htmlFile = path.join(tempDir, 'gen2.html');
    fs.writeFileSync(
        htmlFile,
        '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
            '<body><h1>Тест</h1><p>Простой HTML</p></body></html>',
        'utf-8'
    );
    files.push(htmlFile);

    var jsonFile = path.join(tempDir, 'gen3.json');
    var jsonData = { a: 1, b: { x: 2, y: [3, 4] }, c: [1, 2, { d: true }] };
    fs.writeFileSync(jsonFile, JSON.stringify(jsonData, null, 2), 'utf-8');
    files.push(jsonFile);

    var binFile = path.join(tempDir, 'gen4.bin');
    var binParts = [];
    for (var i = 32; i <= 126; i++) binParts.push(String.fromCharCode(i));
    binParts.push('\t\n\r');
    fs.writeFileSync(binFile, binParts.join('') + '\nБайты 0x20-0x7E, таб, CR, LF.\n', 'utf-8');
    files.push(binFile);

    var bigFile = path.join(tempDir, 'gen5-big.txt');
    var bigSize = 1.5 * 1024 * 1024;
    var line = 'Большой файл для теста. Строка с данными. ';
    var chunks = [];
    while (chunks.length * line.length < bigSize) chunks.push(line);
    fs.writeFileSync(bigFile, chunks.join('').substring(0, bigSize), 'utf-8');
    files.push(bigFile);

    return files;
}

function runEncodeNegative(files) {
    run('encode: без аргументов', function () {
        var r = encode([]);
        if (r.code === 0) throw new Error('Ожидался ненулевой код выхода');
    });
    run('encode: только 2 аргумента (мало)', function () {
        var r = encode(['20', path.join(tempDir, 'out.json')]);
        if (r.code === 0) throw new Error('Ожидался ненулевой код выхода');
    });
    run('encode: нечётное число аргументов (файл без фразы)', function () {
        var r = encode(['20', path.join(tempDir, 'out.json'), files[0]]);
        if (r.code === 0) throw new Error('Ожидался ненулевой код выхода');
    });
    run('encode: фраза нечётной длины', function () {
        var r = encode(['20', path.join(tempDir, 'out.json'), files[0], 'ПРИВЕ']);
        if (r.code === 0) throw new Error('Ожидался ненулевой код выхода');
        if (r.stderr.indexOf('четной') === -1) throw new Error('Ожидалось сообщение о чётной длине');
    });
    run('encode: фраза с повторяющимися парами', function () {
        var r = encode(['20', path.join(tempDir, 'out.json'), files[0], 'ПРИВПРИ']);
        if (r.code === 0) throw new Error('Ожидался ненулевой код выхода');
    });
    run('encode: дубликат фразы', function () {
        var r = encode(['20', path.join(tempDir, 'out.json'), files[0], 'ПРИВЕТ', files[1], 'ПРИВЕТ']);
        if (r.code === 0) throw new Error('Ожидался ненулевой код выхода');
    });
    run('encode: комбинаций меньше минимума', function () {
        var r = encode(['5', path.join(tempDir, 'out.json'), files[0], 'ПРИВЕТ']);
        if (r.code === 0) throw new Error('Ожидался ненулевой код выхода');
        if (r.stderr.indexOf('не менее') === -1) throw new Error('Ожидалось сообщение о минимуме комбинаций');
    });
}

function runEncodePositive(files, prefix) {
    var puzzle1 = path.join(tempDir, prefix + 'puzzle1.json');
    var puzzle2 = path.join(tempDir, prefix + 'puzzle2.json');
    var puzzle5 = path.join(tempDir, prefix + 'puzzle5.json');

    run('encode: 1 файл', function () {
        var r = encode(['20', puzzle1, files[0], phrases[0]]);
        if (r.code !== 0) throw new Error('Код выхода ' + r.code + ': ' + r.stderr);
        if (!fs.existsSync(puzzle1)) throw new Error('Пазл-файл не создан');
        var j = JSON.parse(fs.readFileSync(puzzle1, 'utf-8'));
        if (typeof j.c !== 'string' || j.c.length % 2 !== 0 || !Array.isArray(j.items) || j.items.length !== 1) {
            throw new Error('Некорректная структура пазл-файла');
        }
        if (typeof j.items[0] !== 'string' || j.items[0].length < 32) {
            throw new Error('Item должен быть строкой (минимум 32 символа — хеш)');
        }
    });

    run('encode: 2 файла', function () {
        var r = encode(['25', puzzle2, files[0], phrases[0], files[1], phrases[1]]);
        if (r.code !== 0) throw new Error('Код выхода ' + r.code + ': ' + r.stderr);
        var j = JSON.parse(fs.readFileSync(puzzle2, 'utf-8'));
        if (j.items.length !== 2) throw new Error('Ожидалось 2 секрета в пазле');
        if (typeof j.items[0] !== 'string' || j.items[0].length < 32) throw new Error('Item — строка (мин. 32 символа)');
    });

    run('encode: 5 файлов', function () {
        var args = ['40', puzzle5];
        for (var i = 0; i < 5; i++) args.push(files[i], phrases[i]);
        var r = encode(args);
        if (r.code !== 0) throw new Error('Код выхода ' + r.code + ': ' + r.stderr);
        var j = JSON.parse(fs.readFileSync(puzzle5, 'utf-8'));
        if (j.items.length !== 5) throw new Error('Ожидалось 5 секретов в пазле');
        if (typeof j.items[0] !== 'string' || j.items[0].length < 32) throw new Error('Item — строка (мин. 32 символа)');
    });

    return { puzzle1: puzzle1, puzzle2: puzzle2, puzzle5: puzzle5 };
}

function runDecodeNegative(puzzlePath) {
    if (!puzzlePath || !fs.existsSync(puzzlePath)) return;
    run('decode: без аргументов', function () {
        var r = decode([]);
        if (r.code === 0) throw new Error('Ожидался ненулевой код выхода');
    });
    run('decode: только пазл-файл (без пары фраза-выход)', function () {
        var r = decode([puzzlePath]);
        if (r.code === 0) throw new Error('Ожидался ненулевой код выхода');
    });
    run('decode: неверная фраза', function () {
        var out = path.join(tempDir, 'wrong-out.txt');
        var r = decode([puzzlePath, 'НЕВЕРНАЯФРАЗА', out]);
        if (r.code === 0) throw new Error('Ожидался ненулевой код выхода');
    });
    run('decode: несуществующий пазл-файл', function () {
        var r = decode([path.join(tempDir, 'nonexistent.json'), 'ПРИВЕТ', path.join(tempDir, 'x.txt')]);
        if (r.code === 0) throw new Error('Ожидался ненулевой код выхода');
    });
}

function runDecodePositive(files, puzzle1Path, puzzle5Path) {
    if (!puzzle1Path || !puzzle5Path || !fs.existsSync(puzzle5Path)) return;
    run('decode: 1 фраза → 1 файл (пазл с несколькими секретами)', function () {
        var out = path.join(tempDir, 'decoded1.txt');
        var r = decode([puzzle5Path, phrases[0], out]);
        if (r.code !== 0) throw new Error('Код выхода ' + r.code + ': ' + r.stderr);
        if (!fs.existsSync(out)) throw new Error('Выходной файл не создан');
        var orig = fs.readFileSync(files[0]);
        var dec = fs.readFileSync(out);
        assertBufferEqual(orig, dec, 0, files[0], out);
    });
    run('decode: все фразы → все файлы', function () {
        var outs = [
            path.join(tempDir, 'd1.txt'),
            path.join(tempDir, 'd2.html'),
            path.join(tempDir, 'd3.json'),
            path.join(tempDir, 'd4.bin'),
            path.join(tempDir, 'd5-big.txt'),
        ];
        var args = [puzzle5Path];
        for (var i = 0; i < 5; i++) args.push(phrases[i], outs[i]);
        var r = decode(args);
        if (r.code !== 0) throw new Error('Код выхода ' + r.code + ': ' + r.stderr);
        for (var j = 0; j < 5; j++) {
            if (!fs.existsSync(outs[j])) throw new Error('Не создан файл ' + outs[j]);
            var orig = fs.readFileSync(files[j]);
            var dec = fs.readFileSync(outs[j]);
            assertBufferEqual(orig, dec, j, files[j], outs[j]);
        }
    });
}

function printReport() {
    var passed = 0;
    var failed = 0;
    for (var i = 0; i < results.length; i++) {
        if (results[i].ok) passed++; else failed++;
    }
    console.log('\n--------------------------------------');
    console.log('Всего: ' + results.length + ', пройдено: ' + passed + ', провалено: ' + failed);
    console.log('======================================\n');
    if (failed > 0) process.exit(1);
}

function cleanupTemp() {
    try {
        if (fs.existsSync(tempDir)) {
            function rmDir(dir) {
                var list = fs.readdirSync(dir);
                for (var i = 0; i < list.length; i++) {
                    var p = path.join(dir, list[i]);
                    if (fs.statSync(p).isDirectory()) rmDir(p);
                    else fs.unlinkSync(p);
                }
                fs.rmdirSync(dir);
            }
            rmDir(tempDir);
            console.log('Временная папка удалена: ' + tempDir);
        }
    } catch (e) {
        console.error('Не удалось удалить временную папку:', e.message);
    }
}

// --- main ---

console.log('Временная папка: ' + tempDir);
console.log('Фикстуры: ' + FIXTURES_DIR);
console.log('Удаление после тестов: ' + (cleanup ? 'да' : 'нет') + '\n');

try {
    ensureFixtures();
    var fixtureFiles = getFixturePaths();

    console.log('--- Этап 1: тесты на фикстурах ---\n');
    runEncodeNegative(fixtureFiles);
    var puzzles1 = runEncodePositive(fixtureFiles, 'f-');
    runDecodeNegative(puzzles1.puzzle1);
    runDecodePositive(fixtureFiles, puzzles1.puzzle1, puzzles1.puzzle5);

    console.log('\n--- Этап 2: тесты на сгенерированных файлах ---\n');
    var generatedFiles = prepareGeneratedFiles();
    var puzzles2 = runEncodePositive(generatedFiles, 'g-');
    runDecodePositive(generatedFiles, puzzles2.puzzle1, puzzles2.puzzle5);
} finally {
    printReport();
    if (cleanup) cleanupTemp();
}
