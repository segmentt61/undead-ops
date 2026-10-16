# UNDEAD OPS — online co-op browser zombies

A fast, low-poly browser FPS (Venge.io-style feel) with **Black Ops 1 style Zombies**:
rounds, boarded windows you rebuild, wall-buys, doors, power switch, perks
(Juggernog, Speed Cola, Double Tap, Quick Revive), the Mystery Box (with the teddy bear!),
Pack-a-Punch, power-ups (Max Ammo, Insta-Kill, Double Points, Kaboom, Carpenter),
hellhound rounds, downs and revives. Up to 8 players per room.

Guns are real low-poly models, gunshots are real recordings, and the map, zombies and effects are
generated in code with PBR materials, shadows, ambient occlusion and bloom.

## Run it

Needs Node.js 18+ (installed on this Mac at `~/.local/node`).

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # only needed on this Mac
npm install
npm start
```

Open http://localhost:3000, type your name, then:
- **Quick Play** joins the busiest open server (or creates one),
- **Create Server** lets you name it, pick the map and max players (or make it private),
- the **Server List** shows every public game — friends just click **JOIN**,
- **Join by code** / invite link still works for private servers.

**Settings** (main menu or Esc): sensitivity, ADS sensitivity, invert Y, toggle aim, FOV,
effects/music volume, rock music on/off, graphics quality, dynamic resolution, FPS display,
gore level (Extreme / Normal / Off) and crosshair color.

## Playing online with friends

The server is one Node process that serves the game and the WebSocket on the same port,
so any host that runs Node and supports WebSockets works.

**Same Wi-Fi / LAN:** run `npm start`, find your local IP (`ipconfig getifaddr en0`)
and have friends open `http://YOUR-IP:3000`.

**Quick share over the internet (no deploy):** with the server running, start a tunnel:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

It prints an `https://….trycloudflare.com` link — send that to your friends.
(Your computer has to stay on while you play.)

**Always-on hosting (free tiers available): Render.com**

Live server: https://undead-ops-eu.onrender.com (Frankfurt)

1. Push this folder to a GitHub repository.
2. On Render: *New → Web Service* → pick the repo.
3. Build command `npm install`, start command `npm start`. Render sets `PORT` automatically.
4. Share the `https://your-app.onrender.com` URL.

Railway, Fly.io or any VPS work the same way (`npm install && npm start`, `PORT` env var).

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse / Left click / Right click | Aim / Fire / Aim down sights |
| Shift | Sprint |
| Space | Jump |
| C or Ctrl | Crouch |
| R | Reload |
| F (or E) | Buy / open / use — **hold** to rebuild barriers and revive |
| V | Knife |
| G | Grenade |
| 1 / 2 / Q / mouse wheel | Switch weapon |
| Tab | Scoreboard |
| T or Enter | Chat |
| Esc | Pause menu (sensitivity, FOV, volume) |

### Controller (PS4 / PS5 / Xbox)

Plug in over USB or pair with Bluetooth, then press any button. Button prompts switch to
PlayStation symbols automatically.

| Xbox | PlayStation | Action |
| --- | --- | --- |
| Left stick / L3 | Left stick / L3 | Move / toggle sprint |
| Right stick | Right stick | Look |
| RT / LT | R2 / L2 | Fire / Aim down sights |
| A | ✕ | Jump (menus: select) |
| B | ○ | Crouch (menus: back) |
| X | □ | Use / buy — hold to rebuild and revive; reloads otherwise |
| Y / D-pad ← → | △ / D-pad ← → | Switch weapon |
| LB | L1 | Grenade |
| RB / R3 | R1 / R3 | Knife |
| View / D-pad ↑ | Share / D-pad ↑ | Scoreboard |
| Menu | Options | Pause |

Stick sensitivity, aim assist and vibration are in **Settings → Controls**.

### Phones and tablets (Android, iPhone, iPad)

Open the game URL in Chrome. On-screen controls appear automatically: a floating joystick on
the left half and drag anywhere on the right to look. **Auto-fire** shoots by itself while the
crosshair (it turns red) is on a zombie in range — you only aim. Only five buttons stay on screen
(fire, aim, jump, crouch, grenade, in an arc around FIRE); **USE**, **RELOAD** and **KNIFE** pop up only
when you can use them, and the small button next to the ammo counter swaps weapons. Auto-fire and
button size are in Settings → Controls.

To install it like an app: Chrome menu ⋮ → **Install app** (or **Add to Home screen**). It
then starts fullscreen in landscape with its own icon. Graphics start on **Low** on touch
devices; raise it in Settings if your device is fast.

**iPhone / iPad:** open the URL in Safari, tap **Share** → **Add to Home Screen**, and start the
game from the new icon. iPhone Safari can't go fullscreen from a normal tab, so the home-screen
version is the one without browser bars. Turn the phone sideways to play. Sound plays even with
the silent switch on (iOS 17+), and PS/Xbox controllers paired over Bluetooth work in Safari too.

## How a game goes

- You start in the **Lobby** with an M1911 and 500 points. Points come from hitting (+10),
  killing (+60, headshot +100, knife +130) and rebuilding boards (+10).
- Zombies come through the boarded windows. Hold **F** at a window to put boards back.
- Buy doors to reach the **Theater Hall**, **Generator Room** (power switch, Double Tap),
  **Dressing Rooms** (Juggernog) and the **Projector Lab** (Pack-a-Punch).
- Turn on the **power** to activate perks and Pack-a-Punch.
- The **Mystery Box** (950) gives a random weapon — Ray Gun and Thunder Cannon included.
  If the teddy bear shows up, the box moves somewhere else.
- When you go down, teammates have 45 seconds to revive you. If everyone is down, it's game over.
  Players who bleed out come back at the start of the next round.

## Gore

Zombies can lose arms, legs and heads. Shoot a leg off and it drops and crawls (like BO1 crawlers);
shotguns, snipers and explosives tear limbs off faster, headshot kills can pop the head, and
explosions / wonder weapons blow zombies apart. Blood sprays onto walls behind them and pools on the floor.

## Maps

The host picks the map in the lobby (or on the game-over screen):

| Map | Inspired by | Notes |
| --- | --- | --- |
| **Kino Outpost** | Kino der Toten | Theater, dressing rooms, projector lab |
| **Bunker 9** | Nacht der Untoten | Tiny concrete bunker + rainy courtyard — hard |
| **Asylum** | Verrückt | Reception, kitchen, dining hall, patient ward, showers |
| **Factory** | Der Riese | Loading bay, factory floor, furnace room, labs |
| **Dead Mall** | L4D2 Dead Center | Atrium, gun store, food court, department store, parking |

Maps are defined in `shared/maps/*.js` with a small builder (rooms, doors, windows, props) that
validates the layout. Adding a map = one new file + an entry in `shared/maps/index.js`.

The builder refuses a map that has a prop in front of a perk, wall-buy, window or door, a Mystery
Box spot that is too tight, or a room the zombies can't reach. Perk machines and Pack-a-Punch are
solid (you can't walk through them), and so is the Mystery Box. Each room is dressed with props
(`public/js/props.js`) plus one-off decals — grime, cracks, blood, graffiti, posters and signs
(`public/js/decals.js`) — so the walls don't look like the same tile repeated.

## Main menu

The menu runs on a live 3D backdrop: a random map, lit like the game, filmed by a slow cinematic
camera while zombies shamble towards it. Create Server shows a tactical mini-map of each map.
Loading shows gameplay tips, each game opens with a mission-style title card, and the room name
pops up when you walk into a new area.

## Graphics settings

Pause menu (Esc) → **Graphics**:
- **High**: dynamic lamp shadows, ambient occlusion, bloom, MSAA (default)
- **Medium**: bloom + MSAA, no shadows/AO — for laptops
- **Low**: no post-processing — for weak PCs

Safari starts on Medium. Resolution scales down automatically when the frame rate drops
(shown top-right as `% res`).

## Credits (CC0 / public domain, characters MIT)

- Gun models: [Ultimate Gun Pack by Quaternius](https://opengameart.org/content/low-poly-guns-pack)
- Gunshots: [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library)
- Zombie voices: [Zombies Sound Pack by artisticdude](https://opengameart.org/content/zombies-sound-pack)
- Reloads: [Gun Reload Sounds by SpringySpringo](https://opengameart.org/content/gun-reload-sounds)
- First-person arms: [FPS arms (rigged) by para](https://opengameart.org/content/fps-arms-rigged-only)
- Monster growls: [Monster Sound Pack by Ogrebane](https://opengameart.org/content/monster-sound-pack-volume-1)
- Ambient music: [Post Apocalyptic Wastelands by Juhani Junkala (SubspaceAudio)](https://opengameart.org/content/horror-atmosphere)
- Rock/metal round music: [rocky musicloop by johndekale](https://opengameart.org/content/rocky-musicloop),
  [Boss Battle #6 Metal by nene](https://opengameart.org/content/boss-battle-6-metal),
  [JRPG Epic Rock Battle Theme #1 by HydroGene](https://opengameart.org/content/jrpg-epic-rock-battle-theme-1)
- Characters (soldiers and zombies): [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox) (MIT licence, see `public/assets/rb/LICENSE`) — Military_Male_01, Medical_Male_02, Police_Male_02, Construction_Male_01, Business_Male_02, Male_Adult_05, Female_Adult_03. Walking and running are animated procedurally in `public/js/rig.js`.
- Wall, floor and ceiling materials: [ambientCG](https://ambientcg.com) — Bricks097, Bricks094, Concrete012,
  PaintedPlaster017, Tiles141, Tiles105, Tiles074, Tiles139, WoodFloor043, Planks039, CorrugatedSteel005,
  OfficeCeiling001, Asphalt031, Ground110
- Reflections HDRI: [Abandoned Factory Canteen 01 by Poly Haven](https://polyhaven.com/a/abandoned_factory_canteen_01)

## Older looks

The previous cartoon-style version is kept as the git tag `v1-cartoon-style` (and branch `cartoon-style`).
To go back to it: `git checkout v1-cartoon-style`.

## Project layout

```
server/index.js   HTTP static server + WebSocket rooms
server/room.js    Authoritative game logic: rounds, zombie AI (flow-field pathing), economy, box, perks…
shared/           Map layout, weapon stats, tuning — used by both server and client
public/js/        Three.js client: world, characters, weapons, entities, HUD, post-processing, audio
public/assets/    Gun models (OBJ) and sound effects (AAC)
```

Tuning lives in `shared/config.js` (health, costs, speeds) and `shared/weapons.js` (guns).
For testing you can start with lots of points: `DEV_POINTS=50000 npm start`.
