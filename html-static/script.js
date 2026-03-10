(function () {
	'use strict';

	var STORAGE_KEY = 'sk';
	var secretItems = [];
	var combos = [];
	var word = '';
	var comboData = [];
	var locked = false;

	var HASH_SEEDS = [5381, 7919, 13331, 19937];

	var COLORS = [
		'#00cc33',
		'#33aa55',
		'#228844',
		'#55bb66',
		'#11aa44',
		'#44cc77',
		'#339966',
		'#22bb55',
		'#00aa33',
		'#55aa44',
		'#33cc66',
		'#11bb55',
		'#44aa33',
		'#22cc44',
		'#00bb44',
	];

	// --- Криптографические функции ---

	function djb2(str, seed) {
		var h = seed >>> 0;
		for (var i = 0; i < str.length; i++) {
			h = (((h << 5) >>> 0) + h + str.charCodeAt(i)) >>> 0;
		}
		return h;
	}

	function hash32(str) {
		var result = '';
		for (var i = 0; i < HASH_SEEDS.length; i++) {
			result += djb2(str, HASH_SEEDS[i]).toString(16).padStart(8, '0');
		}
		return result;
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
		var i,
			j = 0,
			tmp;

		for (i = 0; i < 256; i++) S[i] = i;
		for (i = 0; i < 256; i++) {
			j = (j + S[i] + keyBytes[i % keyBytes.length]) & 255;
			tmp = S[i];
			S[i] = S[j];
			S[j] = tmp;
		}

		var a = 0,
			b = 0;
		for (i = 0; i < 3072; i++) {
			a = (a + 1) & 255;
			b = (b + S[a]) & 255;
			tmp = S[a];
			S[a] = S[b];
			S[b] = tmp;
		}

		var result = new Uint8Array(data.length);
		for (i = 0; i < data.length; i++) {
			a = (a + 1) & 255;
			b = (b + S[a]) & 255;
			tmp = S[a];
			S[a] = S[b];
			S[b] = tmp;
			result[i] = data[i] ^ S[(S[a] + S[b]) & 255];
		}
		return result;
	}

	function decrypt(base64, keyBytes) {
		var bin = atob(base64);
		var encBytes = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) {
			encBytes[i] = bin.charCodeAt(i);
		}
		return new TextDecoder().decode(rc4(keyBytes, encBytes));
	}

	// --- Утилиты ---

	function shuffle(arr) {
		var result = arr.slice();
		for (var i = result.length - 1; i > 0; i--) {
			var j = Math.floor(Math.random() * (i + 1));
			var tmp = result[i];
			result[i] = result[j];
			result[j] = tmp;
		}
		return result;
	}

	function calcFontSize() {
		var vw = window.innerWidth;
		var vh = window.innerHeight;
		return Math.min(24, Math.max(14, Math.min(vw / 30, vh / 20)));
	}

	function calcCols() {
		var vw = window.innerWidth;
		if (vw <= 400) return 3;
		if (vw <= 600) return 4;
		return 5;
	}

	function escapeHtml(str) {
		var el = document.createElement('div');
		el.textContent = str;
		return el.innerHTML;
	}

	// --- Инициализация пазла ---

	function init(combos) {
		var container = document.getElementById('puzzle');
		container.innerHTML = '';
		comboData = [];

		var shuffled = shuffle(combos);
		var count = shuffled.length;
		var cols = calcCols();
		var rows = Math.ceil(count / cols);
		var cellW = 96 / cols;
		var cellH = 82 / rows;
		var fontSize = calcFontSize();

		var cells = [];
		for (var r = 0; r < rows; r++) {
			for (var c = 0; c < cols; c++) {
				cells.push({ col: c, row: r });
			}
		}
		cells = shuffle(cells);

		for (var i = 0; i < count; i++) {
			var cell = cells[i];
			var x = 2 + cell.col * cellW + Math.random() * Math.max(1, cellW - 10);
			var y = 2 + cell.row * cellH + Math.random() * Math.max(1, cellH - 6);
			var angle = Math.round((Math.random() * 20 - 10) * 10) / 10;
			var color = COLORS[Math.floor(Math.random() * COLORS.length)];
			var text = Math.random() > 0.5 ? shuffled[i] : shuffled[i].toLowerCase();

			var el = document.createElement('span');
			el.className = 'combo';
			el.textContent = text;
			el.style.left = x + '%';
			el.style.top = y + '%';
			el.style.fontSize = fontSize + 'px';
			el.style.color = color;
			el.style.setProperty('--angle', angle + 'deg');

			comboData.push({
				el: el,
				value: shuffled[i],
				used: false,
			});

			(function (idx) {
				el.addEventListener('click', function () {
					onComboClick(idx);
				});
			})(i);

			container.appendChild(el);
		}

		updateDisplay();
	}

	// --- Обработка кликов ---

	function onComboClick(index) {
		if (locked) return;

		var data = comboData[index];
		if (data.used) return;

		data.used = true;
		data.el.classList.add('used');
		word += data.value;

		updateDisplay();
		checkSecret();
	}

	function checkSecret() {
		if (!secretItems.length) return;

		var derived = deriveKey(word);
		var item = null;
		for (var i = 0; i < secretItems.length; i++) {
			if (secretItems[i].k === derived.hex) {
				item = secretItems[i];
				break;
			}
		}
		if (!item) return;

		locked = true;
		try {
			var content = decrypt(item.d, derived.bytes);
			showContent(content);
		} catch (e) {
			locked = false;
		}
	}

	// --- Отображение ---

	function showContent(html) {
		document.getElementById('puzzle').style.display = 'none';
		document.getElementById('display').style.display = 'none';
		var root = document.getElementById('root');
		root.style.display = 'block';

		var btn = document.createElement('button');
		btn.textContent = 'Зашифровать';
		btn.className = 'lock-btn';
		btn.addEventListener('click', resetTopuzzle);

		root.innerHTML = '';
		root.appendChild(btn);
		var content = document.createElement('div');
		content.innerHTML = html;
		root.appendChild(content);

		try {
			sessionStorage.setItem(STORAGE_KEY, word);
		} catch (e) {}
	}

	function resetTopuzzle() {
		try {
			sessionStorage.removeItem(STORAGE_KEY);
		} catch (e) {}
		word = '';
		locked = false;
		comboData = [];
		document.getElementById('root').style.display = 'none';
		document.getElementById('root').innerHTML = '';
		document.getElementById('puzzle').style.display = '';
		document.getElementById('display').style.display = '';
		init(combos);
	}

	function tryRestoreFromSession() {
		try {
			var saved = sessionStorage.getItem(STORAGE_KEY);
			if (!saved || !secretItems.length) return false;

			var derived = deriveKey(saved);
			var item = null;
			for (var i = 0; i < secretItems.length; i++) {
				if (secretItems[i].k === derived.hex) {
					item = secretItems[i];
					break;
				}
			}
			if (!item) return false;

			var content = decrypt(item.d, derived.bytes);
			word = saved;
			locked = true;
			showContent(content);
			return true;
		} catch (e) {
			return false;
		}
	}

	function updateDisplay() {
		var display = document.getElementById('display');
		if (!word) {
			display.innerHTML =
				'<div class="word placeholder">• • •</div>';
			return;
		}
		const dots = word.length < 6 ? Array(3 - Math.floor(word.length / 2)).fill(' •').join('') : '';
		display.innerHTML = '<div class="word">' + escapeHtml(word) + dots + '</div>';
	}

	function onResize() {
		var fontSize = calcFontSize();
		comboData.forEach(function (d) {
			d.el.style.fontSize = fontSize + 'px';
		});
	}

	// --- Ошибка загрузки ---

	function showLoadError(message) {
		document.getElementById('puzzle').style.display = 'none';
		document.getElementById('display').style.display = 'none';
		var el = document.getElementById('error');
		el.textContent = message;
		el.className = 'error-placeholder error-placeholder_visible';
	}

	// --- Запуск ---

	fetch('secret.json')
		.then(function (r) {
			if (!r.ok) {
				throw new Error(`Не удалось загрузить пазл (${r.status} ${r.statusText})`);
			}
			return r.json();
		})
		.then(function (json) {
			if (!json) throw new Error('Некорректный формат пазл-файла');

			if (typeof json.c === 'string') {
				var list = [];
				for (var i = 0; i < json.c.length; i += 2) list.push(json.c.substring(i, i + 2));
				combos = list;
			} else if (Array.isArray(json.c)) {
				combos = json.c;
			} else {
				throw new Error('Некорректный формат пазл-файла (ожидается c: строка или массив)');
			}

			if (Array.isArray(json.items)) {
				secretItems = [];
				for (var j = 0; j < json.items.length; j++) {
					var it = json.items[j];
					if (typeof it === 'string' && it.length >= 32) {
						secretItems.push({ k: it.substring(0, 32), d: it.substring(32) });
					} else if (it && typeof it.k === 'string' && typeof it.d === 'string') {
						secretItems.push(it);
					} else {
						throw new Error('Некорректный формат пазл-файла (item: строка или {k,d})');
					}
				}
			} else if (typeof json.d === 'string' && json.d.length >= 32) {
				secretItems = [{ k: json.d.substring(0, 32), d: json.d.substring(32) }];
			} else {
				throw new Error('Некорректный формат пазл-файла (ожидаются items или d)');
			}
			if (!tryRestoreFromSession()) {
				init(combos);
			}
		})
		.catch(function (err) {
			showLoadError(
				err && err.message
					? err.message
					: 'Не удалось загрузить secret.json'
			);
		});

	window.addEventListener('resize', onResize);
})();

function copyme(e) {
	const text = e.innerHTML;
	navigator.clipboard.writeText(text).then(
		function () {
			console.log('Async: Copying to clipboard was successful!');
		},
		function (err) {
			console.error('Async: Could not copy text: ', err);
			alert('Ошибка при копировании. Подробности в консоли.');
		},
	);
}

function openme(e) {
	const url = e.innerHTML;
	window.open(url, '_blank').focus();
}
