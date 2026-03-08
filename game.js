"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

const scoreEl = document.getElementById("scoreValue");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlayTitle");
const overlaySubtitleEl = document.getElementById("overlaySubtitle");

const btnStart = document.getElementById("btnStart");
const btnPause = document.getElementById("btnPause");
const btnToggleMusic = document.getElementById("btnToggleMusic");
const btnToggleSfx = document.getElementById("btnToggleSfx");
const trackBannerEl = document.getElementById("trackBanner");
const trackTitleEl = document.getElementById("trackTitle");
const trackAuthorEl = document.getElementById("trackAuthor");
const musicVolumeEl = document.getElementById("musicVolume");

const CELL_SIZE = 24;
let COLS = canvas ? Math.floor(canvas.width / CELL_SIZE) : 26;
let ROWS = canvas ? Math.floor(canvas.height / CELL_SIZE) : 20;

const MOVES_PER_SECOND = 8;
const MOVE_INTERVAL = 1000 / MOVES_PER_SECOND;

const COLORS = {
  background: "#050510",
  grid: "rgba(40, 50, 90, 0.35)",
  snakeHead: "#00ffcc",
  snakeBody: "#00b8ff",
  food: "#ff4b8b",
};

const Direction = {
  LEFT: { x: -1, y: 0 },
  UP: { x: 0, y: -1 },
  RIGHT: { x: 1, y: 0 },
  DOWN: { x: 0, y: 1 },
};

let state = {
  snake: [],
  direction: Direction.RIGHT,
  nextDirection: Direction.RIGHT,
  food: null,
  score: 0,
  lastTime: 0,
  accumulator: 0,
  running: false,
  gameOver: false,
  paused: false,
  startedOnce: false,
};

const audioManager = (() => {
  let ctxAudio = null;
  let musicEnabled = true;
  let sfxEnabled = true;
  let musicVolume = 0.5;
  let musicConfig = null;
  let musicReady = false;
  let configPromise = null;
  const trackMap = new Map();
  let shuffledTrackIds = [];
  let currentTrackIndex = 0;
  let currentTrackId = null;
  let trackChangeListener = null;

  function ensureContext() {
    if (!ctxAudio) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        return;
      }
      ctxAudio = new AudioCtx();
    } else if (ctxAudio.state === "suspended") {
      ctxAudio.resume();
    }
  }

  function playBeep(freq, duration, type = "square", gainValue = 0.15) {
    if (!sfxEnabled) return;
    ensureContext();
    if (!ctxAudio) return;
    const t0 = ctxAudio.currentTime;
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(gainValue, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(ctxAudio.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  }

  function playFood() {
    playBeep(900, 0.09, "square", 0.16);
  }

  function playDeath() {
    if (!sfxEnabled) return;
    ensureContext();
    if (!ctxAudio) return;
    const t0 = ctxAudio.currentTime;
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(600, t0);
    osc.frequency.exponentialRampToValueAtTime(80, t0 + 0.4);
    gain.gain.setValueAtTime(0.22, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
    osc.connect(gain).connect(ctxAudio.destination);
    osc.start(t0);
    osc.stop(t0 + 0.45);
  }

  function playStart() {
    playBeep(660, 0.08, "square", 0.2);
    setTimeout(() => playBeep(990, 0.09, "square", 0.2), 90);
  }

  function loadMusicConfig() {
    if (configPromise) {
      return configPromise;
    }
    configPromise = fetch("assets/music/tracks.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load tracks.json");
        }
        return response.json();
      })
      .then((data) => {
        if (!data || !Array.isArray(data.tracks) || data.tracks.length === 0) {
          throw new Error("tracks.json has no tracks");
        }
        musicConfig = data;
        initialiseTracks(data.tracks);
        musicReady = true;
      })
      .catch(() => {
        musicConfig = null;
        musicReady = false;
        if (trackChangeListener) {
          trackChangeListener({ title: "Music unavailable", author: "tracks.json failed to load" });
        }
      });
    return configPromise;
  }

  function initialiseTracks(tracks) {
    trackMap.clear();
    const defaultId = musicConfig && musicConfig.defaultTrackId;
    const validTracks = tracks.filter((t) => t.id && t.file);
    const ids = validTracks.map((t) => t.id);
    if (defaultId && ids.includes(defaultId)) {
      const rest = ids.filter((id) => id !== defaultId);
      shuffleArray(rest);
      shuffledTrackIds = [defaultId, ...rest];
    } else {
      shuffledTrackIds = [...ids];
      shuffleArray(shuffledTrackIds);
    }
    currentTrackIndex = 0;
    currentTrackId = shuffledTrackIds[0] || null;

    validTracks.forEach((track) => {
      if (trackMap.has(track.id)) return;
      const audio = new Audio("assets/music/" + track.file);
      audio.preload = "auto";
      audio.loop = false;
      audio.volume = musicVolume;
      audio.addEventListener("ended", handleTrackEnded);
      audio.addEventListener("error", () => {
        if (trackChangeListener) {
          trackChangeListener({ title: "Track unavailable", author: track.author || "Unknown" });
        }
      });
      trackMap.set(track.id, { meta: track, audio });
    });
    fireTrackChange();
  }

  function shuffleArray(arr) {
    if (!arr || arr.length <= 1) return;
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  function handleTrackEnded(event) {
    const entry = getCurrentEntry();
    if (!entry || event.target !== entry.audio) return;
    advanceToNextTrack();
  }

  function advanceToNextTrack() {
    if (!shuffledTrackIds.length) return;
    currentTrackIndex += 1;
    if (currentTrackIndex >= shuffledTrackIds.length) {
      shuffleArray(shuffledTrackIds);
      currentTrackIndex = 0;
    }
    currentTrackId = shuffledTrackIds[currentTrackIndex];
    fireTrackChange();
    if (musicEnabled) {
      playCurrentTrack();
    }
  }

  function getCurrentEntry() {
    if (!currentTrackId) return null;
    return trackMap.get(currentTrackId) || null;
  }

  function playCurrentTrack() {
    const entry = getCurrentEntry();
    if (!entry) return;
    const audio = entry.audio;
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Ignore play errors (e.g. autoplay restrictions).
      });
    }
  }

  function stopCurrentTrack() {
    const entry = getCurrentEntry();
    if (!entry) return;
    entry.audio.pause();
    entry.audio.currentTime = 0;
  }

  function fireTrackChange() {
    if (!trackChangeListener) return;
    const info = getCurrentTrackInfo();
    if (info) {
      trackChangeListener(info);
    }
  }

  function startMusic() {
    if (!musicEnabled) return;
    loadMusicConfig().then(() => {
      if (!musicEnabled || !musicReady) return;
      if (!currentTrackId && shuffledTrackIds.length) {
        currentTrackIndex = 0;
        currentTrackId = shuffledTrackIds[0];
        fireTrackChange();
      }
      playCurrentTrack();
    });
  }

  function stopMusic() {
    stopCurrentTrack();
  }

  function setMusicEnabled(enabled) {
    musicEnabled = enabled;
    if (!enabled) {
      stopMusic();
    } else if (state.running && !state.gameOver) {
      startMusic();
    }
  }

  function setSfxEnabled(enabled) {
    sfxEnabled = enabled;
  }

  function isMusicEnabled() {
    return musicEnabled;
  }

  function isSfxEnabled() {
    return sfxEnabled;
  }

  function setMusicVolume(vol) {
    musicVolume = Math.max(0, Math.min(1, vol));
    trackMap.forEach((entry) => {
      entry.audio.volume = musicVolume;
    });
  }

  function getMusicVolume() {
    return musicVolume;
  }

  function getCurrentTrackInfo() {
    const entry = getCurrentEntry();
    return entry ? entry.meta : null;
  }

  function setTrackChangeListener(listener) {
    trackChangeListener = listener;
  }

  return {
    playFood,
    playDeath,
    playStart,
    startMusic,
    stopMusic,
    setMusicEnabled,
    setSfxEnabled,
    isMusicEnabled,
    isSfxEnabled,
    loadMusicConfig,
    getCurrentTrackInfo,
    setTrackChangeListener,
    setMusicVolume,
    getMusicVolume,
  };
})();

function resetGame() {
  const startX = Math.floor(COLS / 2);
  const startY = Math.floor(ROWS / 2);
  state.snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ];
  state.direction = Direction.RIGHT;
  state.nextDirection = Direction.RIGHT;
  const food = spawnFood();
  state.food = food;
  state.score = 0;
  state.lastTime = 0;
  state.accumulator = 0;
  state.running = false;
  state.gameOver = false;
  state.paused = false;
  updateScore();
  setOverlay(true, "Press Enter or Start", "Use arrows or WASD. Avoid yourself.");
  updatePauseButton();
  draw();
}

function startGame() {
  if (state.running) return;
  if (state.gameOver) {
    resetGame();
  }
  state.running = true;
  state.paused = false;
  state.startedOnce = true;
  state.lastTime = 0;
  state.accumulator = 0;
  setOverlay(false);
  updatePauseButton();
  audioManager.playStart();
  audioManager.startMusic();
  window.requestAnimationFrame(gameLoop);
}

function togglePause() {
  if (!state.running || state.gameOver) return;
  state.paused = !state.paused;
  if (state.paused) {
    setOverlay(true, "Paused", "Press P or click Resume to continue.");
    audioManager.stopMusic();
  } else {
    setOverlay(false);
    audioManager.startMusic();
    state.lastTime = 0;
    state.accumulator = 0;
    window.requestAnimationFrame(gameLoop);
  }
  updatePauseButton();
}

function gameLoop(timestamp) {
  if (!state.running || state.paused) {
    draw();
    return;
  }

  if (!state.lastTime) {
    state.lastTime = timestamp;
  }
  const delta = timestamp - state.lastTime;
  state.lastTime = timestamp;
  state.accumulator += delta;

  const MAX_UPDATES_PER_FRAME = 10;
  let updatesThisFrame = 0;
  while (state.accumulator >= MOVE_INTERVAL && updatesThisFrame < MAX_UPDATES_PER_FRAME) {
    update();
    state.accumulator -= MOVE_INTERVAL;
    updatesThisFrame += 1;
  }

  draw();
  if (state.running && !state.gameOver) {
    window.requestAnimationFrame(gameLoop);
  }
}

function update() {
  state.direction = state.nextDirection;

  const head = state.snake[0];
  let newHead = {
    x: head.x + state.direction.x,
    y: head.y + state.direction.y,
  };

  if (newHead.x < 0) newHead.x = COLS - 1;
  else if (newHead.x >= COLS) newHead.x = 0;
  if (newHead.y < 0) newHead.y = ROWS - 1;
  else if (newHead.y >= ROWS) newHead.y = 0;

  if (isOnSnake(newHead)) {
    handleGameOver();
    return;
  }

  const ateFood = state.food && newHead.x === state.food.x && newHead.y === state.food.y;

  state.snake.unshift(newHead);

  if (ateFood) {
    state.score += 10;
    updateScore();
    audioManager.playFood();
    const newFood = spawnFood();
    state.food = newFood;
  } else {
    state.snake.pop();
  }
}

function handleGameOver() {
  state.running = false;
  state.gameOver = true;
  audioManager.playDeath();
  audioManager.stopMusic();
  setOverlay(
    true,
    "Game Over",
    "Final score: " + state.score + ". Press Enter or Start to play again."
  );
  updatePauseButton();
}

function spawnFood() {
  const empty = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!isOnSnake({ x, y })) empty.push({ x, y });
    }
  }
  if (empty.length === 0) return null;
  return empty[Math.floor(Math.random() * empty.length)];
}

function isOnSnake(pos) {
  return state.snake.some((segment) => segment.x === pos.x && segment.y === pos.y);
}

function updateScore() {
  if (scoreEl) {
    scoreEl.textContent = String(state.score);
  }
}

function setOverlay(visible, title, subtitle) {
  if (!overlayEl) return;
  overlayEl.classList.toggle("overlay-visible", Boolean(visible));
  overlayEl.classList.toggle("overlay-hidden", !visible);
  if (title && overlayTitleEl) overlayTitleEl.textContent = title;
  if (subtitle && overlaySubtitleEl) overlaySubtitleEl.textContent = subtitle;
}

function draw() {
  if (!ctx) return;
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE + 0.5, 0);
    ctx.lineTo(x * CELL_SIZE + 0.5, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE + 0.5);
    ctx.lineTo(canvas.width, y * CELL_SIZE + 0.5);
    ctx.stroke();
  }

  state.snake.forEach((segment, index) => {
    const screenX = segment.x * CELL_SIZE;
    const screenY = segment.y * CELL_SIZE;
    const inset = 2;
    ctx.fillStyle = index === 0 ? COLORS.snakeHead : COLORS.snakeBody;
    ctx.shadowColor = index === 0 ? COLORS.snakeHead : COLORS.snakeBody;
    ctx.shadowBlur = index === 0 ? 16 : 10;
    ctx.fillRect(screenX + inset, screenY + inset, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2);
  });
  ctx.shadowBlur = 0;

  if (state.food) {
    const fx = state.food.x * CELL_SIZE;
    const fy = state.food.y * CELL_SIZE;
    const radius = CELL_SIZE / 2 - 4;
    const centerX = fx + CELL_SIZE / 2;
    const centerY = fy + CELL_SIZE / 2;
    const gradient = ctx.createRadialGradient(
      centerX,
      centerY,
      2,
      centerX,
      centerY,
      radius
    );
    gradient.addColorStop(0, "#ffe1ff");
    gradient.addColorStop(0.4, COLORS.food);
    gradient.addColorStop(1, "#7c0036");
    ctx.fillStyle = gradient;
    ctx.shadowColor = COLORS.food;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function showTrackBanner(trackInfo) {
  if (!trackBannerEl || !trackTitleEl || !trackAuthorEl || !trackInfo) return;
  trackTitleEl.textContent = trackInfo.title || "Unknown Track";
  trackAuthorEl.textContent = trackInfo.author || "Unknown Artist";

  trackBannerEl.classList.remove("track-banner--visible");
  // Force reflow so the transition retriggers when we add the class again.
  // eslint-disable-next-line no-unused-expressions
  trackBannerEl.offsetWidth;
  trackBannerEl.classList.add("track-banner--visible");
}

function handleDirectionChange(newDir) {
  if (
    state.direction.x + newDir.x === 0 &&
    state.direction.y + newDir.y === 0
  ) {
    return;
  }
  state.nextDirection = newDir;
}

function handleKeyDown(event) {
  const key = event.key.toLowerCase();
  if (key === "arrowup" || key === "w") {
    event.preventDefault();
    handleDirectionChange(Direction.UP);
  } else if (key === "arrowdown" || key === "s") {
    event.preventDefault();
    handleDirectionChange(Direction.DOWN);
  } else if (key === "arrowleft" || key === "a") {
    event.preventDefault();
    handleDirectionChange(Direction.LEFT);
  } else if (key === "arrowright" || key === "d") {
    event.preventDefault();
    handleDirectionChange(Direction.RIGHT);
  } else if (key === "enter") {
    event.preventDefault();
    if (!state.running) {
      startGame();
    } else if (state.gameOver) {
      startGame();
    }
  } else if (key === "p") {
    event.preventDefault();
    togglePause();
  }
}

function handleStartButton() {
  if (state.running && !state.gameOver) {
    resetGame();
  }
  startGame();
  if (canvas) canvas.focus();
}

function updatePauseButton() {
  if (!btnPause) return;
  const canPause = state.running && !state.gameOver;
  btnPause.disabled = !canPause;
  btnPause.textContent = state.paused ? "Resume" : "Pause";
}

function handlePauseButton() {
  if (!state.running || state.gameOver) return;
  togglePause();
}

function handleToggleMusic() {
  const enabled = !audioManager.isMusicEnabled();
  audioManager.setMusicEnabled(enabled);
  btnToggleMusic.textContent = enabled ? "Music: On" : "Music: Off";
}

function handleToggleSfx() {
  const enabled = !audioManager.isSfxEnabled();
  audioManager.setSfxEnabled(enabled);
  btnToggleSfx.textContent = enabled ? "SFX: On" : "SFX: Off";
}

function attachEventListeners() {
  window.addEventListener("keydown", handleKeyDown);
  if (btnStart) btnStart.addEventListener("click", handleStartButton);
  if (btnPause) btnPause.addEventListener("click", handlePauseButton);
  if (btnToggleMusic) btnToggleMusic.addEventListener("click", handleToggleMusic);
  if (btnToggleSfx) btnToggleSfx.addEventListener("click", handleToggleSfx);
  if (musicVolumeEl) {
    musicVolumeEl.addEventListener("input", () => {
      const vol = musicVolumeEl.value / 100;
      audioManager.setMusicVolume(vol);
    });
    musicVolumeEl.value = String(Math.round(audioManager.getMusicVolume() * 100));
  }
}

function updateGridSize() {
  if (!canvas) return;
  COLS = Math.floor(canvas.width / CELL_SIZE);
  ROWS = Math.floor(canvas.height / CELL_SIZE);
}

window.addEventListener("resize", updateGridSize);
audioManager.loadMusicConfig();
audioManager.setTrackChangeListener((info) => {
  showTrackBanner(info);
});
attachEventListeners();
updateGridSize();
resetGame();

