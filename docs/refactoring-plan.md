# リファクタリング方針書

> **対象読者**: このリポジトリで作業する AI モデル / 開発者
> **最終更新**: 2026-07-05
> **関連文書**: [game-spec.md](./game-spec.md) — 現行のゲーム仕様(挙動維持の判定基準)

## 0. このドキュメントの使い方

- 作業は **フェーズ順に** 進めること。フェーズをまたいだ変更を1コミットに混ぜない。
- すべてのフェーズは **挙動維持(behavior-preserving)** が原則。ゲームバランス・見た目・操作感を変えない。
  例外は Phase 4 の「既知バグの修正」のみで、そこでも修正内容を明記してからコミットする。
- 各フェーズの最後に「検証」節のチェックを必ず実施する。
- 疑問があれば [game-spec.md](./game-spec.md) を仕様の正とする。仕様書とコードが食い違う場合はコードの挙動が正(仕様書を直す)。

---

## 1. プロジェクト概要

- **内容**: アイソメトリック表示の RTS 風陣取りゲーム「NO LIFE KING」。プレイヤー(青/不死者)と CPU(赤)が拠点を奪い合う。
- **技術**: Nuxt 4 (SSR無効・SPA) / Vue 3 / Pinia / PixiJS v8 / simplex-noise / TypeScript
- **起動**: `npm run dev` → **必ずポート 3340**(nuxt.config.ts で設定済み。変更禁止。`.agents/rules/no-life-king.md` にも記載)
- **テスト・Lint**: 現状なし(Phase 2 で vitest を導入する)

## 2. 現状の問題点

### 2.1 ファイル構成

| ファイル | 行数 | 問題 |
|---|---|---|
| `app/stores/game.ts` | 1,259 | Pinia ストアに型定義・バランス定数・PRNG・A*経路探索・マップ生成・シミュレーション・戦闘・CPU AI がすべて同居 |
| `app/components/GameCanvas.vue` | 2,233 | 神コンポーネント。PIXI初期化・アセット読込・ピクセル加工・タイトル画面・背景霧・時刻表示・HUD・マップ/拠点/ユニット描画・矢印描画・入力処理(長押し/ダブルクリック/ドラッグ)・昼夜tintが全部入り |
| `app/components/TitleScreen.vue` | 504 | **デッドコード**。タイトル画面は GameCanvas 内の PIXI 実装に置換済み。テンプレートから参照されていない |
| `app/components/TimeDisplay.vue` | 200 | **デッドコード**。同上(PIXI 実装に置換済み) |
| `app/app.vue` | 43 | TitleScreen / TimeDisplay を import しているがテンプレートで未使用 |
| ルート直下の `analyze_*.py`, `generate_md.py` / `scripts/*.py` | — | アセット解析用の使い捨てスクリプトがソースツリーに散在 |

### 2.2 コード品質の問題(挙動には影響しないもの)

- マジックナンバーが全域に散在: グリッド寸法 `52`/`53`、タイル1マス `16`px、タイルコード `0/1/4/21-24/31-35`、各種バランス数値。
- `initGame()` 内に未使用の PRNG 実装(`hashString` ベースの `random` クロージャ)が残存。実際に使うのは `mulberry32` のみ。
- `getTerrainSpeedMultiplier` / `getTileCost` の `owner` 引数は未使用。
- CPU が送軍時に `this.sendRatio` を一時的に書き換えて戻すハック(`tryCPUSend`)。
- 矢印描画コードがほぼ同一のまま3箇所に重複(`renderArrow` 内の2分岐 + 選択ユニットのパス描画。各 ~80行)。
- `GameCanvas.vue` の巨大 ticker コールバック(約600行)にタイトル演出とゲーム描画が同居。
- PIXI v8 で非推奨の `sprite.name` / `getChildByName` を使用(`label` / `getChildByLabel` が推奨)。

### 2.3 既知バグ(Phase 4 で修正。それまでは触らない)

1. **A* の座標キー衝突**: `app/stores/game.ts` の `findPath` 内 `key = (x, y) => y * 51 + x` とデコード `k % 51`。グリッドは 0..52(53幅)なので `x = 51, 52` でキーが衝突する(例: `key(51,0) === key(0,1)`)。エンコードとデコードは一貫して 51 を使っているため通常は破綻しないが、右端2列の経路が不正になりうる。**修正は 51 → 53 に統一**。
2. **イベントリスナーのリーク**: `GameCanvas.vue` のスライダー用 `window.addEventListener('pointermove', originalHandlePointerMove)` と無名の `pointerup` リスナーが `onUnmounted` で解放されていない。
3. `RANK_CONFIG` に型注釈がなく `RANK_CONFIG[base.rank]` のアクセスが偶然通っている(`as const` + `Record<Rank, …>` 化する)。

---

## 3. 目標構成

Nuxt 4 の srcDir は `app/`。ゲームロジックは Vue/Pinia/PIXI に依存しない**純粋 TypeScript** として `app/game/` に切り出し、描画は `app/render/` に分離する。ストアとコンポーネントは薄いオーケストレーション層にする。

```
app/
├── app.vue                     # 変更最小(未使用 import の削除のみ)
├── types/
│   └── game.ts                 # Owner, Rank, Base, Unit, GameState などの型定義
├── game/                       # ★純粋ロジック層(Vue/Pinia/PIXI を import しない)
│   ├── constants.ts            # RANK_CONFIG, UNIT_SPEED, GRID_SIZE, TILE(タイルコード定数), バランス定数
│   ├── random.ts               # hashString + mulberry32(シード付きPRNGファクトリ)
│   ├── daynight.ts             # isDaytime, getTimeSpeedMultiplier, getTimeDecayMultiplier,
│   │                           #   getNightAlpha, getNightTint(GameCanvas から移動)
│   ├── terrain.ts              # getTerrainSpeedMultiplier, getTileCost
│   ├── pathfinding.ts          # findPath(A* + バイナリヒープ)
│   ├── mapGenerator.ts         # 地形ノイズ生成・川・橋・陸地接続・拠点配置(initGame の大半)
│   ├── simulation.ts           # update() の中身: 生産・移動・戦闘・減衰・到着処理
│   └── cpu.ts                  # executeCPUAction, tryCPUSend
├── stores/
│   └── game.ts                 # 薄い Pinia ストア: state 保持 + game/ 各モジュールの呼び出しのみ
├── render/                     # ★PIXI 描画層(状態は読むだけ。ゲームロジックを書かない)
│   ├── coords.ts               # toIso / fromIso / ellipseEdge, ISO定数
│   ├── colors.ts               # OWNER_COLORS, DARK_OWNER_COLORS, ZONE_COLORS
│   ├── assets.ts               # アセットパス定義と PIXI.Assets 一括ロード
│   ├── textureUtils.ts         # createFrames, createFlagTexture, createVillageTexture,
│   │                           #   createTransparentTexture(Canvas ピクセル加工)
│   ├── layers.ts               # レイヤーコンテナ生成と stage への追加順定義
│   ├── mapRenderer.ts          # 静的マップタイルの敷き詰め
│   ├── baseRenderer.ts         # 拠点(スプライト・旗・数値・支配領域・ハイライト)の生成/毎フレーム更新
│   ├── unitRenderer.ts         # ユニット(AnimatedSprite・数値)の生成/更新/破棄
│   ├── arrowRenderer.ts        # 矢印・経路線の描画(3箇所の重複を1実装に統合)
│   ├── titleRenderer.ts        # PIXIタイトル画面(背景・ロゴ・ボタン・火の粉・フェード遷移)
│   ├── timeDisplayRenderer.ts  # 時刻表示ウィジェット(空・太陽・月・大地・レリーフ枠)
│   ├── backgroundRenderer.ts   # 呪われた霧の背景(多重スクロール)
│   ├── hudRenderer.ts          # SEED表示・Send Ratio スライダー・フローティングテキスト
│   └── effects.ts              # createFloatingText
├── composables/
│   └── useGameInput.ts         # ポインタ入力(ドラッグ・長押し・ダブルクリック・コンテキストメニュー状態)
└── components/
    └── GameCanvas.vue          # 薄い部品: PIXI App 生成、各 renderer の組み立て、ticker 登録、
                                #   DOM オーバーレイ(コンテキストメニュー・ゲームオーバーモーダル)

tools/                          # Python 製アセット解析スクリプト置き場(ルート直下と scripts/ から移動)
docs/                           # 本ドキュメント群
```

**依存の向き(厳守)**: `types` ← `game` ← `stores` ← `render` / `composables` ← `components`。
`game/` 配下から Vue・Pinia・PIXI・ブラウザ API(`window`, `document`)を import してはならない(テスト可能性の担保)。ただし `textureUtils.ts` 等の render 層は `document.createElement('canvas')` を使用してよい。

---

## 4. 作業フェーズ

### Phase 0: ベースライン確立

1. 作業ブランチを作成: `git checkout -b refactor/architecture`
2. `npm install` → `npm run dev`(ポート3340)で起動確認。タイトル画面 → 「覚醒する」→ ゲーム開始まで目視確認。
3. シード固定の基準値を記録: タイトルの「特定の運命(SEED)で開始」から `123456` を入力し、生成されたマップのスクリーンショットを取得して `docs/baseline/` に保存(以後の決定性確認に使う)。
4. `npx nuxi typecheck` を実行し、既存エラーの有無を記録(既存エラーがあれば「直さずに」記録のみ)。

### Phase 1: デッドコード削除と整理(挙動変化ゼロ)

1. `app/components/TitleScreen.vue` と `app/components/TimeDisplay.vue` を削除。
   - 削除前に `grep -rn "TitleScreen\|TimeDisplay" app/` で参照が `app.vue` の import 文だけであることを確認。
2. `app/app.vue` から未使用 import(`TitleScreen`, `TimeDisplay`, 使っていなければ `useGameStore` も)を削除。
3. `app/stores/game.ts` の `initGame` 内、未使用の `hashString` ベース `random` クロージャを削除(`hashString` 自体は `seedNum` 生成に使うので残す)。
4. ルート直下の `analyze_sprite.py`, `analyze_grid.py`, `generate_md.py` と `scripts/*.py`, `scripts/sim_map.ts` を `tools/` に移動(`git mv`)。これらはビルドに関与しない。
5. `public/assets/Denzi111023-1.png.bak` と、未参照のアセット(`grep -rn` でコード参照を確認してから)を削除。参照確認が取れないものは残す。

**検証**: `npm run dev` で起動し、タイトル→ゲーム開始→拠点ドラッグで送軍、が動くこと。`npx nuxi typecheck` が Phase 0 と同等以下のエラー数であること。

### Phase 2: ロジック層の抽出(`app/game/`)+ テスト導入

`app/stores/game.ts` から純粋ロジックを移動する。**このフェーズでは1文字もロジックを書き換えない**(コピー移動 + import 修正のみ)。関数シグネチャの変更(例: `mapGrid` を引数で受ける化)は許可。

1. `app/types/game.ts`: `Owner`, `Rank`, `Base`, `Unit`, `GameState` を移動。既存 import 元(store, GameCanvas)を追従修正。
2. `app/game/constants.ts`: `RANK_CONFIG`, `UNIT_SPEED` に加え、散在するマジックナンバーを命名して集約:
   - `GRID_MAX = 52`, `TILE_PX = 16`, `LOGICAL_SIZE = 832`
   - `TILE = { GRASS: 0, WATER: 1, MOUNTAIN: 2, WOOD: 3, BRIDGE: 4 } as const` とバリアント範囲(21-24, 31-35)
   - ※数値の**値**は一切変えない。名前を付けるだけ。
3. `app/game/random.ts`: `hashString` + `createMulberry32(seed: number)` ファクトリ。
   - **重要**: `initGame` 内での PRNG 消費順(`createNoise2D(rnd)` ×2 → 川 → 橋 → …)を絶対に変えない。順序が変わると同一シードで別マップになる。
4. `app/game/daynight.ts`: store の `isDaytime`, `getTimeSpeedMultiplier`, `getTimeDecayMultiplier` と、GameCanvas 内の `getNightAlpha`, `getNightTint` を移動。
5. `app/game/terrain.ts`, `app/game/pathfinding.ts`: そのまま移動。既知バグ(51/53)は**まだ直さない**。
6. `app/game/mapGenerator.ts`: `initGame` の地形生成〜拠点配置を `generateMap(rnd): { mapGrid, bases }` の形に抽出。`createBase` 相当のファクトリもここか constants 側に置く。
7. `app/game/simulation.ts`: `update()` の中身(生産・移動・戦闘・減衰・到着=`resolveCombat`)を `updateSimulation(state, deltaSeconds)` として抽出。
8. `app/game/cpu.ts`: `executeCPUAction` / `tryCPUSend` を抽出。`sendRatio` 一時書き換えハックは、`sendUnits(sourceId, targetId, ratio?)` に ratio 引数を追加して解消してよい(挙動同一)。
9. `app/stores/game.ts` を書き直し: state 定義と、上記モジュールを呼ぶ薄い actions のみ残す。目標 150 行以下。
10. **vitest 導入**: `npm i -D vitest`。`package.json` に `"test": "vitest run"` を追加。最低限のテスト:
    - `random.spec.ts`: 同一シードで同一乱数列。
    - `mapGenerator.spec.ts`: シード `123456` で生成した `mapGrid` のハッシュ(例: JSON文字列長 + 数値合計)をスナップショット。**このテストが以後の決定性の番人になる。**
    - `pathfinding.spec.ts`: 小さな固定グリッドで水を迂回すること、Rank3 は水を渡れること。
    - `daynight.spec.ts`: 境界値(360, 1020, 1080, 300)の倍率。

**検証**: `npm run test` 全パス。dev サーバーでシード `123456` を入力し、Phase 0 のスクリーンショットと同一マップが出ること。`npx nuxi typecheck` 通過。

### Phase 3: 描画層の分割(`app/render/` + GameCanvas 縮小)

`GameCanvas.vue` を分割する。ここも挙動維持。分割単位は「3. 目標構成」の `render/` 各ファイル。進め方:

1. まず副作用のない純関数から: `coords.ts`(toIso/fromIso/ellipseEdge)、`colors.ts`、`textureUtils.ts`。
2. `assets.ts`: アセットパスの `?t=${Date.now()}` キャッシュバスターは開発用ハックなので、全パス共通の定数に寄せる(挙動同一のまま整理)。
3. 各 renderer は「`init(deps)` で PIXI オブジェクトを構築して返し、`update(state)` を毎フレーム呼ぶ」形のクラスまたはファクトリ関数に統一する。ticker 本体は GameCanvas に残し、各 renderer の `update` を順に呼ぶだけにする。
4. `arrowRenderer.ts` で矢印描画の3重複を統合する。統合の際、線幅・色・alpha・矢頭サイズの微差(選択パス: alpha 1.0 / ドラッグ矢印: alpha 0.8 など)をオプション引数で吸収し、**見た目を変えない**。
5. 入力処理(pointerdown/長押し/ダブルクリック/グローバル pointerup/move)を `composables/useGameInput.ts` に移動。コンテキストメニューの状態(ref)もここに置き、GameCanvas はテンプレートで参照するだけにする。
6. `GameCanvas.vue` の目標: 300 行以下(script 部)。
7. あわせて PIXI v8 非推奨 API を置換: `sprite.name` → `sprite.label`, `getChildByName` → `getChildByLabel`。

**検証**: 以下を dev サーバーで手動確認(すべて Phase 0 と同じ見た目・操作感であること):
- タイトル画面の演出(ロゴグロー、火の粉、ボタンホバーの光筋、フェードイン遷移、SEED入力)
- マップ描画(草/水/山/木/橋、アイソメ配置、Yソート)
- 拠点: 数値表示、旗(本拠地・砦・城)、村の所有者別色、支配領域の楕円
- ユニット: 移動アニメ、左右反転、戦闘アニメ、数値、選択時の経路線+矢印
- ドラッグ送軍の矢印(A*経路の折れ線)、ダブルクリックの全軍送軍、長押しコンテキストメニュー(アップグレード/待機)
- 昼夜サイクル: マップの夜間tint、時刻表示の空クロスフェード、太陽/月の軌道と地平線マスク、霧の濃度変化
- Send Ratio スライダー、SEED 表示、ゲームオーバーモーダル

### Phase 4: 既知バグ修正とクリーンアップ(唯一、挙動が変わりうるフェーズ)

1. A* キー衝突修正: `pathfinding.ts` の `51` → `GRID_W = 53` に統一(エンコード・デコード両方)。修正後、`pathfinding.spec.ts` に右端列(x=51,52)を通る経路のテストを追加。
2. スライダーの window イベントリスナーを `onUnmounted` で解放(`useGameInput.ts` or hudRenderer 側)。
3. `RANK_CONFIG` を `Record<Rank, { cap: number; growth: number; upgradeCost: number }>` として型付け。
4. `terrain.ts` の未使用 `owner` 引数を削除(呼び出し側も追従)。
5. 各修正は個別コミットにし、コミットメッセージに「何が変わるか」を明記。

**検証**: `npm run test` 全パス(マップ決定性スナップショットが**変わらない**こと。A*修正はマップ生成に影響しない)。手動でユニットがマップ右端付近を移動するケースを確認。

### Phase 5: ドキュメント整備

1. `README.md` をプロジェクト実態に書き換え(現在は Nuxt スターターのまま): ゲーム概要、起動方法(ポート3340)、ディレクトリ構成、テスト実行方法。
2. リポジトリルートに `CLAUDE.md` を作成: dev ポート 3340、`docs/` の参照指示、挙動維持の原則、`npm run test` の実行指示。
3. 本ドキュメントの「現状の問題点」を完了状況に合わせて更新。

---

## 5. 全フェーズ共通ルール

- **禁止**: 依存パッケージのバージョン変更・追加(vitest を除く)、バランス数値の変更、アセットファイルの変更、`nuxt.config.ts` のポート変更、SSR の有効化。
- **シード決定性は最重要の不変条件**。PRNG(`mulberry32`)の呼び出し回数・順序を変える変更は一切禁止。`createNoise2D` に渡す順序も含む。
- 日本語コメントは維持・移動する(削除しない)。新規コメントも日本語でよい。
- コミットは小さく、フェーズ内でも論理単位ごとに分ける。コミットメッセージは既存履歴に合わせて日本語。
- 型チェックは `npx nuxi typecheck`、動作確認は `npm run dev`(ポート3340)+ ブラウザ目視。
- 迷ったら「移動だけして書き換えない」を選ぶ。改善したい箇所を見つけたら本ドキュメントの末尾「今後の課題」に追記して先に進む。

## 6. 今後の課題(本リファクタリングのスコープ外)

- ユニット衝突判定・追跡判定の O(n²) 走査(ユニット数が増えると重い。空間分割の導入候補)。
- 拠点/ユニット描画の毎フレーム全件更新(差分更新化)。
- CPU AI の強化(現在は最寄り優先の単純ロジック)。
- モバイル対応(タッチ操作は long-press ベースで一応動くが未検証)。
- E2E テスト(Playwright 等)の導入。
