# 🗺️ maiChiho - ちほー距離計算器

maimai DX NET 的地圖（ちほー）獎勵距離計算器。在 mapDetail 頁面上即時顯示每個獎勵的距離資訊，不用再自己對 Wiki 查表。

## ✨ 功能

- 🔍 自動偵測當前地圖名稱與已行走距離
- 📦 從預編譯資料庫即時載入獎勵資料（收錄 **170+** 張地圖）
- 🌐 資料庫找不到時自動從 Gamerch Wiki 即時抓取
- 🏷️ 在獎勵圖標下方注入剩餘距離標籤
- ✅ 顯示獎勵類型（課題曲、解禁楽曲、フレーム、パーフェクトチャレンジ 等）
- 🌏 支援 maimaidx-eng.com 和 maimaidx.jp

## 📌 安裝方式

### 書籤列（Bookmarklet）

1. 前往 **[安裝頁面](https://thetom123.github.io/maiChiho/)**
2. 將頁面上的按鈕**拖曳**到瀏覽器書籤列
3. 完成！

### 手動安裝

在 maimai DX NET 的 mapDetail 頁面上，打開瀏覽器的開發者工具 Console，貼上 [`chiho_distance_calculator.js`](chiho_distance_calculator.js) 的內容並執行。

## 📖 使用方法

1. 登入 [maimai DX NET](https://maimaidx-eng.com/) 或 [maimaidx.jp](https://maimaidx.jp/)
2. 進入任何一張地圖的詳情頁面（`mapDetail`）
3. 點擊書籤列上的「🗺️ ちほー距離計算器」
4. 腳本會自動偵測地圖名稱和已行走距離，顯示完整的獎勵距離列表

## 📁 檔案說明

| 檔案 | 說明 |
|---|---|
| `chiho_distance_calculator.js` | 計算器本體（Bookmarklet / Console 腳本） |
| `chiho_data.json` | 預編譯的地圖獎勵距離資料庫 |
| `crawl_to_json.py` | 從 Gamerch Wiki 爬取資料並產生 JSON 的腳本 |
| `index.html` | GitHub Pages 安裝頁面 |

## 🔄 資料更新

資料庫的獎勵距離主要從 [Gamerch maimai 攻略 Wiki](https://gamerch.com/maimai/) 抓取。

當新地圖剛開放、Wiki 尚未更新距離時，會從直播或實機對照手動填入距離資料。

### 更新資料庫

```bash
# 需要 Python 3 和 beautifulsoup4
pip install beautifulsoup4
python crawl_to_json.py
```

## 📜 License

MIT
