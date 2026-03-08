# Retro Snake Web Game

A retro-style Snake game built for the browser, inspired by classic arcade cabinets. Guide a neon snake across a glowing grid, eat food to grow, wrap around the screen edges, and avoid colliding with yourself.

## Features

- **Classic Snake Gameplay**: Grow by eating food, lose if you hit yourself.
- **Edge Wrapping**: Move off any edge of the screen to reappear on the opposite side.
- **Score Tracking**: Live score display in the top-right of the game frame that increases each time you eat.
- **Retro Aesthetic**: Neon colors, pixel-style font, CRT-like scanlines and glow.
- **Audio**: Procedurally generated retro sound effects and looping chip-style background music, with separate toggles.
- **Keyboard & Button Controls**: Play with Arrow keys or WASD, plus on-page buttons to start/pause and toggle audio.

## How to Play

- **Move**: Arrow keys or WASD.
- **Start / Restart**: Press **Enter** or click **Start / Restart**.
- **Pause / Resume**: Press **P** or click **Start / Restart** while running.
- **Music Toggle**: Click **Music: On/Off**.
- **SFX Toggle**: Click **SFX: On/Off**.

The snake can pass through all four edges of the grid and will reappear on the opposite side. Each food item eaten increases your score and makes the snake longer. The game ends immediately when the snake collides with its own body.

## Project Structure

- `index.html` &mdash; Main webpage and layout for the game.
- `styles.css` &mdash; Retro arcade styling and responsive layout.
- `game.js` &mdash; Core game logic, rendering, input handling, and audio.
- `assets/sfx/` &mdash; Placeholder directory for sound effects assets (audio is currently generated in code).
- `assets/music/` &mdash; Placeholder directory for music assets (music is currently generated in code).

## Running Locally

No build step is required. You can open the game directly in a browser:

1. Clone or download the repository.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox, or Safari).

For a smoother experience and to match how it will run when hosted, you can also serve it with a simple static HTTP server (for example, using `npx serve` or a similar tool).

## Deployment (GitHub Pages)

This game is intended to be hosted via GitHub Pages:

1. Push this project to a public GitHub repository (for example, `retro-snake-web`).
2. In the repository settings on GitHub, enable **GitHub Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main` (or your default branch), folder `/ (root)`.
3. After a short delay, your game will be accessible at the GitHub Pages URL shown in the settings.

Once deployed, anyone can play the game directly in their browser using that URL.

## License

This project is licensed under the MIT License. See `LICENSE` for details.

