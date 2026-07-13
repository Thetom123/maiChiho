// ============================================================
// maimai ちほー距離計算器 (Chiho Distance Calculator)
// 使用方式：在 maimai DX NET 的 mapDetail 頁面
// 於瀏覽器的 Console 中貼上此腳本並執行
// 或製作成書籤列 (Bookmarklet)
// 支援: maimaidx-eng.com / maimaidx.jp
// ============================================================

(async function () {
  'use strict';

  // ── 0. 防止重複注入 ──
  if (document.getElementById('chiho-calc-panel')) {
    document.getElementById('chiho-calc-panel').remove();
  }
  // 清除先前注入的標籤
  document.querySelectorAll('.chiho-dist-lbl').forEach(el => el.remove());

  // ── 1. 抓取地圖名稱（精確選擇器） ──
  let mapName = '';

  // 最精確：mapdetail_name_block_inner > span
  const nameEl = document.querySelector('.mapdetail_name_block_inner span');
  if (nameEl) {
    mapName = nameEl.textContent.trim();
  }

  // 備用方法
  if (!mapName) {
    const allText = document.body.innerText;
    const patterns = [
      /([^\n\r]{2,30}ちほー\d*)/,
      /([^\n\r]{2,30}エリア[^\n\r]{0,10})/,
      /(BLACK ROSE[^\n\r]{0,15})/,
      /(KALEIDXSCOPE[^\n\r]{0,20})/,
    ];
    for (const p of patterns) {
      const m = allText.match(p);
      if (m) { mapName = m[1].trim(); break; }
    }
  }

  // ── 2. 抓取當前距離 ──
  let currentKm = 0;
  const totalEl = document.querySelector('.mapdetail_total');
  if (totalEl) {
    const m = totalEl.textContent.match(/(\d[\d,]*)/);
    if (m) currentKm = parseInt(m[1].replace(/,/g, ''), 10);
  }

  // 備用
  if (currentKm === 0) {
    const allText = document.body.innerText;
    const kmMatch = allText.match(/(\d[\d,]*)\s*Km/i);
    if (kmMatch) currentKm = parseInt(kmMatch[1].replace(/,/g, ''), 10);
  }

  // 剩餘距離提示
  let kmLeftText = '';
  const leftEl = document.querySelector('.see_through_block');
  if (leftEl) {
    const t = leftEl.textContent.trim();
    if (t.includes('left') || t.includes('km')) kmLeftText = t;
  }

  // ── 3. 收集獎勵圖標元素與偵測完成狀態 ──
  const rewardBlocks = document.querySelectorAll('.see_through_area .basic_block');
  const completedIndices = new Set();
  rewardBlocks.forEach((block, idx) => {
    // 若沒有 gray_img 類別，代表該獎勵在網頁中已經是彩色（已達成）
    const hasGrayImg = !!block.querySelector('.gray_img');
    if (!hasGrayImg) {
      // 防呆：如果是 0km 的地圖（尚未遊玩），第一個區塊在網頁上雖為彩色，但實際上尚未獲得
      if (idx === 0 && currentKm === 0) {
        return;
      }
      completedIndices.add(idx);
    }
  });

  // 判斷是否為括弧包圍的字串，支援多種括弧形式（全形/半形圓括弧、書名號/角括弧、雙角括弧、角型引號等）
  function isBracketed(str) {
    if (!str) return false;
    const s = str.trim();
    const startChars = ['（', '(', '〈', '《', '<'];
    const endChars = ['）', ')', '〉', '》', '>'];
    for (let i = 0; i < startChars.length; i++) {
      if (s.startsWith(startChars[i]) && s.endsWith(endChars[i])) {
        return true;
      }
    }
    return false;
  }

  const cleanStr = s => s ? s.toLowerCase()
    .replace(/[\s\u3000\-－~～_\.]/g, '')
    .replace(/[「」『』【】()（）[\]]/g, '')
    .replace(/\*+/g, '') : '';

  function checkIsSong(text) {
    if (!text) return false;
    const trimmed = text.trim();
    if (isBracketed(trimmed)) return true;
    const nonSongKeywords = ['背景', '名牌板', '底板', '頭像', '旅伴', 'チケット', 'ちほー', 'icon', 'frame', 'plate', 'ticket', '券', '角色', '旅行相手'];
    const cleaned = trimmed.toLowerCase();
    for (const kw of nonSongKeywords) {
      if (cleaned.includes(kw)) return false;
    }
    return true;
  }

  function isMatch(raw1, raw2) {
    const s1 = cleanStr(raw1);
    const s2 = cleanStr(raw2);
    if (!s1 || !s2) return false;
    if (s1 === s2) return true;

    const num1 = (s1.match(/\d+/g) || []).join('');
    const num2 = (s2.match(/\d+/g) || []).join('');
    if (num1 !== num2) return false;

    return s1.includes(s2) || s2.includes(s1);
  }

  // 統一的完成狀態判定函數（解決地圖因過濾歌曲或自訂編輯導致索引長度不符的問題）
  function isRewardDone(i, cumulative, currentKm, mappedDomIdx) {
    const rem = cumulative - currentKm;
    if (rem < 0) return true;
    if (rem === 0) {
      if (mappedDomIdx !== undefined && mappedDomIdx !== -1) {
        if (completedIndices.has(mappedDomIdx)) return true;
      } else {
        if (completedIndices.has(i)) return true;
      }
      // 容錯機制：如果因為過濾/編輯而使索引超出網頁 DOM 數量，但網頁最後一個圖標已經完成，則也視為完成
      if (rewardBlocks.length > 0 && completedIndices.has(rewardBlocks.length - 1)) {
        const maxCumulative = activeMapData && activeMapData.rewards.length > 0
          ? activeMapData.rewards[activeMapData.rewards.length - 1].cumulative
          : 0;
        if (cumulative >= maxCumulative) return true;
      }
    }
    return false;
  }

  // 依據類型自動對齊 DOM 區塊與 Wiki 獎勵里程碑
  function alignRewardsToBlocks(processedRewards, blocks) {
    // 當獎勵數量與 DOM 區塊數量一致時，直接 1 對 1 順序對齊
    // 這是最常見的情況，避免分類錯誤導致跳過
    if (processedRewards.length === blocks.length) {
      return processedRewards.map((_, idx) => idx);
    }

    // 數量不一致時（通常是自訂編輯或 Wiki 資料有異），使用智慧對齊
    const domTaskBlocks = [];
    const domRewardBlocks = [];
    blocks.forEach((block, idx) => {
      const isTask = !!block.querySelector('.mapdetail_taskmusic_icon, .mapdetail_perfectchallenge_icon');
      if (isTask) {
        domTaskBlocks.push({ block, originalIdx: idx });
      } else {
        domRewardBlocks.push({ block, originalIdx: idx });
      }
    });

    const wikiTaskRewards = [];
    const wikiRewardRewards = [];
    processedRewards.forEach((r, idx) => {
      const isTask = r.unlockEl && isBracketed(r.unlockEl);
      if (isTask) {
        wikiTaskRewards.push({ r, originalIdx: idx });
      } else {
        wikiRewardRewards.push({ r, originalIdx: idx });
      }
    });

    const wikiToDomMap = new Array(processedRewards.length).fill(-1);

    const rewardCount = Math.min(domRewardBlocks.length, wikiRewardRewards.length);
    for (let i = 0; i < rewardCount; i++) {
      wikiToDomMap[wikiRewardRewards[i].originalIdx] = domRewardBlocks[i].originalIdx;
    }

    const taskCount = Math.min(domTaskBlocks.length, wikiTaskRewards.length);
    for (let i = 0; i < taskCount; i++) {
      wikiToDomMap[wikiTaskRewards[i].originalIdx] = domTaskBlocks[i].originalIdx;
    }

    // 容錯：若智慧對齊導致過多未對齊項目，回退為順序對齊
    const unmappedCount = wikiToDomMap.filter(x => x === -1).length;
    if (unmappedCount > 0 && processedRewards.length <= blocks.length) {
      const mappedCount = processedRewards.length - unmappedCount;
      if (unmappedCount >= Math.ceil(mappedCount * 0.25)) {
        console.warn('[Chiho] 智慧對齊有過多未映射項目，回退為順序對齊');
        return processedRewards.map((_, idx) => idx < blocks.length ? idx : -1);
      }
    }

    return wikiToDomMap;
  }

  // 全局歌曲名稱集合 (從網頁底部的歌曲列表預先收集)
  const songTitles = new Set();
  document.querySelectorAll('form[action*="musicDetail"]').forEach(form => {
    const block = form.closest('.basic_block');
    if (block) {
      const titleEl = block.querySelector('.f_14.break');
      if (titleEl) {
        const t = titleEl.textContent.trim();
        if (t) songTitles.add(t);
      }
    }
  });

  // 全局非歌曲獎勵名稱集合 (從 Wiki 圖片解析收集)
  const nonSongRewards = new Set();

  // 全域狀態
  let activeMapData = null;
  let isEditing = false;

    // ── 4. 顯示面板 ──
    const panel = document.createElement('div');
    panel.id = 'chiho-calc-panel';
    panel.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.78); z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Segoe UI', 'Noto Sans JP', 'Microsoft JhengHei', sans-serif;
  `;

    const detectedInfo = mapName
      ? `<span style="color:#818cf8; font-weight:600;">${mapName}</span>`
      : '<span style="color:#f87171;">未偵測到（請手動輸入）</span>';

    panel.innerHTML = `
    <div id="chiho-calc-content" style="
      background: #0f172a;
      border-radius: 20px; padding: 24px 28px; max-width: 680px; width: 92%;
      max-height: 88vh; overflow-y: auto; color: #e2e8f0;
      box-shadow: 0 25px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
      border: 1px solid rgba(99, 102, 241, 0.25);
      scrollbar-width: thin; scrollbar-color: rgba(99,102,241,0.3) transparent;
    ">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:18px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:26px; filter:drop-shadow(0 0 8px rgba(99,102,241,0.5));">🗺️</span>
          <div>
            <h2 style="margin:0; font-size:17px; font-weight:700; color:#818cf8;">
              ちほー距離計算器
            </h2>
            <div style="font-size:10px; color:#475569; margin-top:1px;">Chiho Distance Calculator</div>
          </div>
        </div>
        <button id="chiho-close-btn" style="
          background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.25);
          color:#f87171; border-radius:8px; padding:5px 12px; cursor:pointer; font-size:13px;
        ">✕</button>
      </div>

      <!-- 偵測資訊 -->
      <div style="
        background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.18);
        border-radius:12px; padding:12px 14px; margin-bottom:14px;
      ">
        <div style="display:flex; gap:16px; flex-wrap:wrap;">
          <div style="flex:1; min-width:160px;">
            <div style="font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:3px;">📍 偵測到的地圖</div>
            <div style="font-size:15px;">${detectedInfo}</div>
          </div>
          <div>
            <div style="font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:3px;">🏃 已行走距離</div>
            <div style="font-size:15px; color:#34d399; font-weight:600;">${currentKm.toLocaleString()} Km</div>
          </div>
          ${rewardBlocks.length ? `<div>
            <div style="font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:3px;">🎁 獎勵數量</div>
            <div style="font-size:15px; color:#fbbf24; font-weight:600;">${rewardBlocks.length} 個</div>
          </div>` : ''}
        </div>
        
        ${kmLeftText ? `<div style="margin-top:10px; font-size:12px; color:#94a3b8; background:rgba(15,23,42,0.5); padding:6px 10px; border-radius:6px;">💬 ${kmLeftText}</div>` : ''}
      </div>

      <!-- 輸入區 -->
      <div style="margin-bottom:14px;">
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input id="chiho-map-input" type="text" placeholder="輸入地圖名稱（日文原名）" value="${mapName}" style="
            flex:1; padding:9px 12px; border-radius:10px; border:1px solid rgba(99,102,241,0.25);
            background:rgba(15,23,42,0.9); color:#e2e8f0; font-size:13px; outline:none;
          ">
          <input id="chiho-km-input" type="number" placeholder="Km" value="${currentKm}" style="
            width:80px; padding:9px 12px; border-radius:10px; border:1px solid rgba(99,102,241,0.25);
            background:rgba(15,23,42,0.9); color:#e2e8f0; font-size:13px; outline:none; text-align:center;
          ">
        </div>
        <button id="chiho-search-btn" style="
          width:100%; padding:10px; border-radius:10px; border:none;
          background:#6366f1;
          color:white; font-size:14px; font-weight:600; cursor:pointer;
          box-shadow:0 4px 18px rgba(99,102,241,0.35);
        ">🔍 從 Wiki 查詢獎勵距離資訊</button>
      </div>

      <!-- 結果區 -->
      <div id="chiho-result">
        <div style="text-align:center; color:#475569; padding:16px; font-size:13px;">
          點擊上方按鈕開始查詢
        </div>
      </div>
    </div>
  `;
    document.body.appendChild(panel);

    // 關閉
    document.getElementById('chiho-close-btn').onclick = () => panel.remove();
    panel.onclick = (e) => { if (e.target === panel) panel.remove(); };

    // 行走距離連動
    document.getElementById('chiho-km-input').oninput = () => {
      if (activeMapData) refreshUI();
    };

    // ── 5. 查詢按鈕 ──
    document.getElementById('chiho-search-btn').onclick = async () => {
      const searchName = document.getElementById('chiho-map-input').value.trim();
      const resultDiv = document.getElementById('chiho-result');
      isEditing = false;

      if (!searchName) {
        resultDiv.innerHTML = '<div style="color:#f87171; text-align:center; padding:14px;">⚠️ 請輸入地圖名稱！</div>';
        return;
      }

      resultDiv.innerHTML = `
      <div style="text-align:center; padding:20px;">
        <div style="display:inline-block; width:24px; height:24px; border:3px solid rgba(99,102,241,0.2);
          border-top-color:#818cf8; border-radius:50%; animation:chihoSpin 0.7s linear infinite;"></div>
        <div style="color:#64748b; margin-top:8px; font-size:12px;">正在從 Gamerch Wiki 抓取「${searchName}」的資料...</div>
      </div>
      <style>@keyframes chihoSpin { to { transform:rotate(360deg); } }</style>
    `;

      try {
        const data = await fetchMapData(searchName);
        if (data && data.rewards.length > 0) {
          activeMapData = data;
          refreshUI();
        } else {
          resultDiv.innerHTML = `
          <div style="text-align:center; padding:18px;">
            <div style="font-size:28px; margin-bottom:8px;">😢</div>
            <div style="color:#f87171; font-weight:600; font-size:14px; margin-bottom:6px;">找不到「${searchName}」</div>
            <div style="font-size:11px; color:#64748b; line-height:1.7; margin-bottom:12px;">
              無法在 Gamerch Wiki 找到地圖或表格資料。<br>您可以使用下方按鈕手動建立全新的獎勵清單：
            </div>
            <button id="chiho-create-manual" style="
              padding:8px 16px; border-radius:8px; border:none;
              background:#22c55e;
              color:white; font-size:13px; font-weight:600; cursor:pointer;
              box-shadow:0 4px 12px rgba(34,197,94,0.3);
            ">➕ 手動建立地圖資料</button>
          </div>
        `;

          document.getElementById('chiho-create-manual').onclick = () => {
            activeMapData = {
              mapName: searchName,
              rewards: [
                { no: '1', distance: 0, cumulative: 0, unlockEl: '起點', song: '', isSongOnly: false, reward: '起點' }
              ],
              source: '手動建立'
            };
            isEditing = true;
            refreshUI();
          };
        }
      } catch (err) {
        resultDiv.innerHTML = `<div style="color:#f87171; text-align:center; padding:14px;">❌ ${err.message}</div>`;
        console.error('[Chiho]', err);
      }
    };

    // ── 6. 從 Wiki 抓取 ──
    const G_CHIHO_MAP = {
      "7sRefちほー": "https://gamerch.com/maimai/534019#outline__7sRef%E3%81%A1%E3%81%BB%E3%83%BC",
      "7sRefちほー2": "https://gamerch.com/maimai/534019#outline__7sRef%E3%81%A1%E3%81%BB%E3%83%BC2",
      "7sRefちほー3": "https://gamerch.com/maimai/534019#outline__7sRef%E3%81%A1%E3%81%BB%E3%83%BC3",
      "7sRefちほー4": "https://gamerch.com/maimai/534019#outline__7sRef%E3%81%A1%E3%81%BB%E3%83%BC4",
      "Arcaeaちほー": "https://gamerch.com/maimai/533913#Arcaea",
      "BLACK ROSEちほー": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC",
      "BLACK ROSEちほー10": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC10",
      "BLACK ROSEちほー11": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC11",
      "BLACK ROSEちほー2 二つの仮面篇": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC2%20%E4%BA%8C%E3%81%A4%E3%81%AE%E4%BB%AE%E9%9D%A2%E7%AF%87",
      "BLACK ROSEちほー2 黒薔薇病篇": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC2%20%E9%BB%92%E8%96%94%E8%96%87%E7%97%85%E7%AF%87",
      "BLACK ROSEちほー3": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC3",
      "BLACK ROSEちほー4": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC4",
      "BLACK ROSEちほー5": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC5",
      "BLACK ROSEちほー6": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC6",
      "BLACK ROSEちほー7": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC7",
      "BLACK ROSEちほー8": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC8",
      "BLACK ROSEちほー9": "https://gamerch.com/maimai/534027#outline__BLACK%20ROSE%E3%81%A1%E3%81%BB%E3%83%BC9",
      "CHUNITHMちほー": "https://gamerch.com/maimai/534688#CHUNITHM",
      "DEEMOちほー": "https://gamerch.com/maimai/533627#DEEMO",
      "HaNaMiNaちほー": "https://gamerch.com/maimai/533946#HaNaMiNa",
      "kawaiiちほー": "https://gamerch.com/maimai/534050#outline__kawaii%E3%81%A1%E3%81%BB%E3%83%BC",
      "kawaiiちほー2": "https://gamerch.com/maimai/534050#outline__kawaii%E3%81%A1%E3%81%BB%E3%83%BC2",
      "からめるちほー": "https://gamerch.com/maimai/533828#karameru",
      "しゅわしゅわちほー": "https://gamerch.com/maimai/533997#outline__%E3%81%97%E3%82%85%E3%82%8F%E3%81%97%E3%82%85%E3%82%8F%E3%81%A1%E3%81%BB%E3%83%BC",
      "しゅわしゅわちほー2": "https://gamerch.com/maimai/533997#outline__%E3%81%97%E3%82%85%E3%82%8F%E3%81%97%E3%82%85%E3%82%8F%E3%81%A1%E3%81%BB%E3%83%BC2",
      "しゅわーランドちほー": "https://gamerch.com/maimai/533908#outline__%E3%81%97%E3%82%85%E3%82%8F%E3%83%BC%E3%83%A9%E3%83%B3%E3%83%89%E3%81%A1%E3%81%BB%E3%83%BC",
      "しゅわーランドちほー2": "https://gamerch.com/maimai/533908#outline__%E3%81%97%E3%82%85%E3%82%8F%E3%83%BC%E3%83%A9%E3%83%B3%E3%83%89%E3%81%A1%E3%81%BB%E3%83%BC2",
      "でらっくすちほー": "https://gamerch.com/maimai/533908#outline__%E3%81%A7%E3%82%89%E3%81%A3%E3%81%8F%E3%81%99%E3%81%A1%E3%81%BB%E3%83%BC",
      "でらっくすちほー2": "https://gamerch.com/maimai/533908#outline__%E3%81%A7%E3%82%89%E3%81%A3%E3%81%8F%E3%81%99%E3%81%A1%E3%81%BB%E3%83%BC2",
      "なないろちほー": "https://gamerch.com/maimai/533997#outline__%E3%81%AA%E3%81%AA%E3%81%84%E3%82%8D%E3%81%A1%E3%81%BB%E3%83%BC",
      "はじまりのちほー": "https://gamerch.com/maimai/533997#outline__%E3%81%AF%E3%81%98%E3%81%BE%E3%82%8A%E3%81%AE%E3%81%A1%E3%81%BB%E3%83%BC",
      "はじまりのちほー2": "https://gamerch.com/maimai/533997#outline__%E3%81%AF%E3%81%98%E3%81%BE%E3%82%8A%E3%81%AE%E3%81%A1%E3%81%BB%E3%83%BC2",
      "みかんヶ岡ちほー 月夜通り": "https://gamerch.com/maimai/534028#outline__%E3%81%BF%E3%81%8B%E3%82%93%E3%83%B6%E5%B2%A1%E3%81%A1%E3%81%BB%E3%83%BC%20%E6%9C%88%E5%A4%9C%E9%80%9A%E3%82%8A",
      "みかんヶ岡ちほー 朝焼け通り": "https://gamerch.com/maimai/534028#outline__%E3%81%BF%E3%81%8B%E3%82%93%E3%83%B6%E5%B2%A1%E3%81%A1%E3%81%BB%E3%83%BC%20%E6%9C%88%E5%A4%9C%E9%80%9A%E3%82%8A",
      "イロドリミドリちほー": "https://gamerch.com/maimai/533828#irodorimidori",
      "イロドリミドリちほー2": "https://gamerch.com/maimai/533627#irodorimidori2",
      "オンゲキちほー5": "https://gamerch.com/maimai/533910#ongeki5",
      "サークルちほー": "https://gamerch.com/maimai/533908#outline__%E3%82%B5%E3%83%BC%E3%82%AF%E3%83%AB%E3%81%A1%E3%81%BB%E3%83%BC",
      "サークルちほー2": "https://gamerch.com/maimai/533908#outline__%E3%82%B5%E3%83%BC%E3%82%AF%E3%83%AB%E3%81%A1%E3%81%BB%E3%83%BC2",
      "スカイストリートちほー": "https://gamerch.com/maimai/534028#outline__%E3%82%B9%E3%82%AB%E3%82%A4%E3%82%B9%E3%83%88%E3%83%AA%E3%83%BC%E3%83%88%E3%81%A1%E3%81%BB%E3%83%BC",
      "スカイストリートちほー2": "https://gamerch.com/maimai/534028#outline__%E3%82%B9%E3%82%AB%E3%82%A4%E3%82%B9%E3%83%88%E3%83%AA%E3%83%BC%E3%83%88%E3%81%A1%E3%81%BB%E3%83%BC2",
      "スカイストリートちほー3": "https://gamerch.com/maimai/534028#outline__%E3%82%B9%E3%82%AB%E3%82%A4%E3%82%B9%E3%83%88%E3%83%AA%E3%83%BC%E3%83%88%E3%81%A1%E3%81%BB%E3%83%BC3",
      "スカイストリートちほー4": "https://gamerch.com/maimai/534028#outline__%E3%82%B9%E3%82%AB%E3%82%A4%E3%82%B9%E3%83%88%E3%83%AA%E3%83%BC%E3%83%88%E3%81%A1%E3%81%BB%E3%83%BC4",
      "スカイストリートちほー5": "https://gamerch.com/maimai/534028#outline__%E3%82%B9%E3%82%AB%E3%82%A4%E3%82%B9%E3%83%88%E3%83%AA%E3%83%BC%E3%83%88%E3%81%A1%E3%81%BB%E3%83%BC5",
      "スカイストリートちほー6": "https://gamerch.com/maimai/534028#outline__%E3%82%B9%E3%82%AB%E3%82%A4%E3%82%B9%E3%83%88%E3%83%AA%E3%83%BC%E3%83%88%E3%81%A1%E3%81%BB%E3%83%BC6",
      "スカイストリートちほー7": "https://gamerch.com/maimai/534028#outline__%E3%82%B9%E3%82%AB%E3%82%A4%E3%82%B9%E3%83%88%E3%83%AA%E3%83%BC%E3%83%88%E3%81%A1%E3%81%BB%E3%83%BC7",
      "トリコロちほー": "https://gamerch.com/maimai/533997#outline__%E3%83%88%E3%83%AA%E3%82%B3%E3%83%AD%E3%81%A1%E3%81%BB%E3%83%BC",
      "トリコロちほー2": "https://gamerch.com/maimai/533997#outline__%E3%83%88%E3%83%AA%E3%82%B3%E3%83%AD%E3%81%A1%E3%81%BB%E3%83%BC2",
      "ドラゴンちほー": "https://gamerch.com/maimai/534020#outline__%E3%83%89%E3%83%A9%E3%82%B4%E3%83%B3%E3%81%A1%E3%81%BB%E3%83%BC",
      "ドラゴンちほー2": "https://gamerch.com/maimai/534020#outline__%E3%83%89%E3%83%A9%E3%82%B4%E3%83%B3%E3%81%A1%E3%81%BB%E3%83%BC2",
      "ドラゴンちほー3": "https://gamerch.com/maimai/534020#outline__%E3%83%89%E3%83%A9%E3%82%B4%E3%83%B3%E3%81%A1%E3%81%BB%E3%83%BC3",
      "ドラゴンちほー4": "https://gamerch.com/maimai/534020#outline__%E3%83%89%E3%83%A9%E3%82%B4%E3%83%B3%E3%81%A1%E3%81%BB%E3%83%BC4",
      "ハピフェスちほー": "https://gamerch.com/maimai/533997#outline__%E3%83%8F%E3%83%94%E3%83%95%E3%82%A7%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC",
      "ハピフェスちほー2": "https://gamerch.com/maimai/533997#outline__%E3%83%8F%E3%83%94%E3%83%95%E3%82%A7%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC2",
      "バディーズちほー": "https://gamerch.com/maimai/533908#outline__%E3%83%90%E3%83%87%E3%82%A3%E3%83%BC%E3%82%BA%E3%81%A1%E3%81%BB%E3%83%BC",
      "バディーズちほー2": "https://gamerch.com/maimai/533908#outline__%E3%83%90%E3%83%87%E3%82%A3%E3%83%BC%E3%82%BA%E3%81%A1%E3%81%BB%E3%83%BC2",
      "パーリィちほー": "https://gamerch.com/maimai/533997#outline__%E3%83%91%E3%83%BC%E3%83%AA%E3%82%A3%E3%81%A1%E3%81%BB%E3%83%BC",
      "パーリィちほー2": "https://gamerch.com/maimai/533997#outline__%E3%83%91%E3%83%BC%E3%83%AA%E3%82%A3%E3%81%A1%E3%81%BB%E3%83%BC2",
      "ヒメヒナちほー": "https://gamerch.com/maimai/797298#HIMEHINA",
      "ヒメヒナちほー2": "https://gamerch.com/maimai/533627#HIMEHINA2",
      "フェスティバルちほー": "https://gamerch.com/maimai/533908#outline__%E3%83%95%E3%82%A7%E3%82%B9%E3%83%86%E3%82%A3%E3%83%90%E3%83%AB%E3%81%A1%E3%81%BB%E3%83%BC",
      "フェスティバルちほー2": "https://gamerch.com/maimai/533908#outline__%E3%83%95%E3%82%A7%E3%82%B9%E3%83%86%E3%82%A3%E3%83%90%E3%83%AB%E3%81%A1%E3%81%BB%E3%83%BC2",
      "ブルーアーカイブちほー": "https://gamerch.com/maimai/973984#bluearchive",
      "ブルーアーカイブちほー2": "https://gamerch.com/maimai/533627#bluearchive2",
      "プリズムちほー": "https://gamerch.com/maimai/533908#outline__%E3%83%97%E3%83%AA%E3%82%BA%E3%83%A0%E3%81%A1%E3%81%BB%E3%83%BC",
      "プリズムちほー２": "https://gamerch.com/maimai/533908#outline__%E3%83%97%E3%83%AA%E3%82%BA%E3%83%A0%E3%81%A1%E3%81%BB%E3%83%BC%EF%BC%92",
      "メダリストちほー": "https://gamerch.com/maimai/533627#medalist",
      "メトロポリスちほー": "https://gamerch.com/maimai/534050#outline__%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC",
      "メトロポリスちほー10": "https://gamerch.com/maimai/534050#outline__%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC10",
      "メトロポリスちほー2 イーシュ襲来": "https://gamerch.com/maimai/534050#outline__%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC2%20%E3%82%A4%E3%83%BC%E3%82%B7%E3%83%A5%E8%A5%B2%E6%9D%A5",
      "メトロポリスちほー2 黒姫の逆襲": "https://gamerch.com/maimai/534050#outline__%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC2%20%E9%BB%92%E5%A7%AB%E3%81%AE%E9%80%86%E8%A5%B2",
      "メトロポリスちほー3": "https://gamerch.com/maimai/534050#outline__%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC3",
      "メトロポリスちほー4": "https://gamerch.com/maimai/534050#outline__%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC4",
      "メトロポリスちほー5": "https://gamerch.com/maimai/534050#outline__%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC5",
      "メトロポリスちほー6": "https://gamerch.com/maimai/534050#outline__%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC6",
      "メトロポリスちほー7": "https://gamerch.com/maimai/534050#outline__%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC7",
      "メトロポリスちほー8": "https://gamerch.com/maimai/534050#outline__%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC8",
      "メトロポリスちほー9": "https://gamerch.com/maimai/534050#outline__%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC9",
      "ユニバースちほー": "https://gamerch.com/maimai/533908#outline__%E3%83%A6%E3%83%8B%E3%83%90%E3%83%BC%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC",
      "ユニバースちほー2": "https://gamerch.com/maimai/533908#outline__%E3%83%A6%E3%83%8B%E3%83%90%E3%83%BC%E3%82%B9%E3%81%A1%E3%81%BB%E3%83%BC2",
      "天界ちほー": "https://gamerch.com/maimai/533907#outline__%E5%A4%A9%E7%95%8C%E3%81%A1%E3%81%BB%E3%83%BC",
      "天界ちほー2": "https://gamerch.com/maimai/533907#outline__%E5%A4%A9%E7%95%8C%E3%81%A1%E3%81%BB%E3%83%BC2",
      "天界ちほー3": "https://gamerch.com/maimai/533907#outline__%E5%A4%A9%E7%95%8C%E3%81%A1%E3%81%BB%E3%83%BC3",
      "天界ちほー4": "https://gamerch.com/maimai/533907#outline__%E5%A4%A9%E7%95%8C%E3%81%A1%E3%81%BB%E3%83%BC4",
      "天界ちほー5": "https://gamerch.com/maimai/533907#outline__%E5%A4%A9%E7%95%8C%E3%81%A1%E3%81%BB%E3%83%BC5",
      "天界ちほー6": "https://gamerch.com/maimai/533907#outline__%E5%A4%A9%E7%95%8C%E3%81%A1%E3%81%BB%E3%83%BC6",
      "天界ちほー7": "https://gamerch.com/maimai/533907#outline__%E5%A4%A9%E7%95%8C%E3%81%A1%E3%81%BB%E3%83%BC7",
      "天界ちほー8": "https://gamerch.com/maimai/533907#outline__%E5%A4%A9%E7%95%8C%E3%81%A1%E3%81%BB%E3%83%BC8",
      "宇宙すてーしょんちほー": "https://gamerch.com/maimai/533997#outline__%E5%AE%87%E5%AE%99%E3%81%99%E3%81%A6%E3%83%BC%E3%81%97%E3%82%87%E3%82%93%E3%81%A1%E3%81%BB%E3%83%BC",
      "宇宙すてーしょんちほー2": "https://gamerch.com/maimai/533997#outline__%E5%AE%87%E5%AE%99%E3%81%99%E3%81%A6%E3%83%BC%E3%81%97%E3%82%87%E3%82%93%E3%81%A1%E3%81%BB%E3%83%BC2",
      "東方Projectリバイバルちほー": "https://gamerch.com/maimai/533913#Toho_revival",
      "森羅万象ちほー": "https://gamerch.com/maimai/533627#shinrabansho",
      "涼宮ハルヒちほー": "https://gamerch.com/maimai/533627#haruhi",
      "舞ヶ原シンセ研究会ちほー": "https://gamerch.com/maimai/534104#maigahara",
      "都市伝説解体センターちほー": "https://gamerch.com/maimai/533627#shueisha",
      "青春ちほー": "https://gamerch.com/maimai/534028#outline__%E9%9D%92%E6%98%A5%E3%81%A1%E3%81%BB%E3%83%BC",
      "高天原ちほー": "https://gamerch.com/maimai/533907#outline__%E9%AB%98%E5%A4%A9%E5%8E%9F%E3%81%A1%E3%81%BB%E3%83%BC",
      "高天原ちほー2": "https://gamerch.com/maimai/533907#outline__%E9%AB%98%E5%A4%A9%E5%8E%9F%E3%81%A1%E3%81%BB%E3%83%BC2",
    };

    // ── 6.5 跨網域請求 (CORS Proxy) ──
    async function fetchGamerchPage(url) {
      const proxies = [
        u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        u => `https://corsproxy.io/?${encodeURIComponent(u)}`
      ];
      let lastErr = null;
      for (const getProxyUrl of proxies) {
        try {
          const proxyUrl = getProxyUrl(url);
          const resp = await fetch(proxyUrl);
          if (resp.ok) return await resp.text();
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error("無法透過 CORS 代理伺服器抓取資料");
    }

    let chihoDatabase = null;
    async function loadChihoDatabase() {
      if (chihoDatabase) return chihoDatabase;
      try {
        const resp = await fetch('https://raw.githubusercontent.com/Thetom123/maiChiho/main/chiho_data.json?t=' + new Date().getTime());
        if (resp.ok) {
          chihoDatabase = await resp.json();
          console.log('[Chiho] 成功從 GitHub 載入地圖資料庫！');
          return chihoDatabase;
        } else {
          console.warn('[Chiho] 載入 GitHub 資料庫失敗，狀態碼:', resp.status);
        }
      } catch (e) {
        console.warn('[Chiho] 無法從 GitHub 載入地圖資料庫，將嘗試即時抓取 Gamerch Wiki:', e);
      }
      chihoDatabase = {};
      return chihoDatabase;
    }

    // 在背景預先載入資料庫
    loadChihoDatabase();

    async function fetchMapData(name) {
      const db = await loadChihoDatabase();
      
      // 優先在資料庫中匹配
      for (const key of Object.keys(db)) {
        if (isMatch(key, name)) {
          console.log(`[Chiho] 成功從資料庫中匹配地圖「${key}」！`);
          const data = db[key];
          data.source = 'GitHub 預編譯資料庫';
          return data;
        }
      }

      console.log(`[Chiho] 資料庫中找不到「${name}」，嘗試從 Gamerch 即時網頁抓取...`);
      let targetUrl = null;
      let targetKey = null;
      for (const key of Object.keys(G_CHIHO_MAP)) {
        if (isMatch(key, name)) {
          targetUrl = G_CHIHO_MAP[key];
          targetKey = key;
          break;
        }
      }

      if (!targetUrl) {
        console.log(`[Chiho] 「${name}」不在靜態地圖中，開始動態掃描 Gamerch 索引頁...`);
        const indices = [
          "https://gamerch.com/maimai/533950",
          "https://gamerch.com/maimai/533627"
        ];
        for (const idxUrl of indices) {
          try {
            const html = await fetchGamerchPage(idxUrl);
            const doc = new DOMParser().parseFromString(html, 'text/html');
            for (const a of doc.querySelectorAll('a')) {
              const linkText = a.textContent.trim();
              if (isMatch(linkText, name)) {
                let href = a.getAttribute('href') || '';
                if (href) {
                  if (!href.startsWith('http')) {
                    href = "https://gamerch.com" + href;
                  }
                  targetUrl = href.replace('/entry/', '/');
                  targetKey = linkText;
                  break;
                }
              }
            }
            if (targetUrl) break;
          } catch (e) {
            console.warn(`[Chiho] 掃描索引頁 ${idxUrl} 失敗:`, e);
          }
        }
      }

      if (!targetUrl) {
        console.warn(`[Chiho] 無法在 Gamerch 找到「${name}」的頁面連結`);
        return null;
      }

      const basePageUrl = targetUrl.split('#')[0];
      const hash = targetUrl.includes('#') ? targetUrl.split('#')[1] : '';

      console.log(`[Chiho] 正在抓取 Gamerch 頁面: ${basePageUrl} (Hash: ${hash})`);
      try {
        const html = await fetchGamerchPage(basePageUrl);
        const data = parseMap(html, name, hash);
        if (data && data.rewards.length > 0) {
          data.source = `Gamerch Wiki (${targetKey || name})`;
          return data;
        }
      } catch (e) {
        console.error(`[Chiho] 抓取頁面 ${basePageUrl} 失敗:`, e);
      }
      return null;
    }

    // ── 7. 解析 Gamerch HTML ──
    function parseMap(html, target, hash) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const headings = doc.querySelectorAll('h2, h3, h4');
      const cleanedTarget = cleanStr(target);

      let found = null;
      
      if (hash) {
        try {
          const decodedHash = decodeURIComponent(hash);
          let el = doc.getElementById(decodedHash) || doc.querySelector(`[id*="${decodedHash}"]`);
          if (el) {
            if (['H2', 'H3', 'H4'].includes(el.tagName)) {
              found = el;
            } else {
              found = el.querySelector('h2, h3, h4') || el.closest('h2, h3, h4');
            }
          }
        } catch (e) { console.warn("[Chiho] 錨點解析失敗:", e); }
      }
      
      if (!found) {
        for (const h of headings) {
          if (isMatch(h.textContent, target)) {
            found = h;
            break;
          }
        }
      }

      if (!found) {
        const tables = doc.querySelectorAll('table');
        if (tables.length === 1) {
          const rewards = parseTable(tables[0]);
          if (rewards.length) return { mapName: target, rewards };
        }
        return null;
      }

      const rewards = [];
      let el = found.nextElementSibling;
      while (el) {
        if (el.tagName === found.tagName || el.tagName === 'H2' || el.tagName === 'H1') {
          break;
        }
        
        const tables = el.tagName === 'TABLE' ? [el] : [...(el.querySelectorAll?.('table') || [])];
        for (const t of tables) {
          if (isValidDistanceTable(t)) {
            rewards.push(...parseTable(t));
          }
        }
        
        if (rewards.length > 0) break;
        el = el.nextElementSibling;
      }
      
      return rewards.length ? { mapName: target, rewards } : null;
    }

    function isValidDistanceTable(table) {
      const firstRow = table.querySelector('tr');
      if (!firstRow) return false;
      const text = firstRow.textContent;
      return text.includes('距離') && text.includes('報酬');
    }

    // ── 8. 解析距離表格 ──
    function parseTable(table) {
      const rows = table.querySelectorAll('tr');
      if (rows.length < 2) return [];

      const headers = [];
      rows[0].querySelectorAll('th, td').forEach(cell => {
        const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
        const text = cell.textContent.trim().toLowerCase();
        for (let c = 0; c < colspan; c++) {
          headers.push(text);
        }
      });

      let cumIdx = headers.findIndex(h => h.includes('距離') || h.includes('累計') || h.includes('km'));
      let typeIdx = headers.findIndex(h => h.includes('種類'));
      let rewardIdx = headers.findIndex(h => h === '報酬' || h.includes('解禁') || h.includes('要素'));
      if (rewardIdx === -1) {
        rewardIdx = headers.findIndex(h => h.includes('報酬') && !h.includes('種類'));
      }

      if (cumIdx === -1) cumIdx = 0;
      if (typeIdx === -1) typeIdx = 1;
      if (rewardIdx === -1) rewardIdx = 2;

      const parsedRewards = [];
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td, th');
        if (cells.length <= Math.max(cumIdx, typeIdx, rewardIdx)) continue;

        const cumVal = cells[cumIdx].textContent.trim();
        const typeVal = typeIdx !== -1 ? cells[typeIdx].textContent.trim() : '';
        const rewardVal = cells[rewardIdx].textContent.trim();

        const cum = pKm(cumVal);
        if (!isNaN(cum) && cum >= 0) {
          const cleanReward = rewardVal.replace(/—/g, '').trim();
          if (!cleanReward) continue;

          const isSong = typeVal.includes('楽曲') || typeVal.includes('曲名') || checkIsSong(cleanReward);

          parsedRewards.push({
            no: i.toString(),
            cumulative: cum,
            unlockEl: cleanReward,
            song: isSong ? cleanReward : '',
            isSongOnly: isSong,
            reward: cleanReward
          });
        }
      }
      return parsedRewards;
    }

    function pKm(s) { return s ? parseInt(s.replace(/,/g, '').replace(/\s/g, ''), 10) : NaN; }

    // ── 8.5 處理獎勵名稱格式化 ──
    function getProcessRewards(rewards) {
      return rewards.map(r => ({
        ...r,
        displayName: r.unlockEl && r.song && r.song !== '—' && r.song !== ''
          ? `${r.unlockEl} [${r.song}]`
          : (r.unlockEl || r.song || r.reward)
      }));
    }

    // ── 9. 重繪與刷新 UI 控制 ──
    function refreshUI() {
      if (!activeMapData) return;

      const searchKm = parseInt(document.getElementById('chiho-km-input').value, 10) || 0;
      const resultDiv = document.getElementById('chiho-result');

      // 非編輯模式時自動排序
      if (!isEditing) {
        activeMapData.rewards.sort((a, b) => a.cumulative - b.cumulative);
      }

      // 取得處理後的獎勵列表
      let processedRewards = getProcessRewards(activeMapData.rewards);
      let wikiToDomMap = alignRewardsToBlocks(processedRewards, rewardBlocks);

      // 計算下一個未完成的獎勵索引
      let nextIdx = -1;
      for (let i = 0; i < processedRewards.length; i++) {
        const itemDone = isRewardDone(i, processedRewards[i].cumulative, searchKm, wikiToDomMap[i]);
        if (!itemDone) {
          nextIdx = i;
          break;
        }
      }

      displayResults(processedRewards, searchKm, resultDiv, completedIndices, nextIdx, wikiToDomMap);
      injectToPage(processedRewards, searchKm, completedIndices, nextIdx, wikiToDomMap);

      // 綁定編輯按鈕事件
      const toggleBtn = document.getElementById('chiho-toggle-edit');
      if (toggleBtn) {
        toggleBtn.onclick = () => {
          isEditing = !isEditing;
          refreshUI();
        };
      }

      const addBtn = document.getElementById('chiho-edit-add');
      if (addBtn) {
        addBtn.onclick = () => {
          const lastCum = activeMapData.rewards.length > 0
            ? activeMapData.rewards[activeMapData.rewards.length - 1].cumulative
            : 0;
          activeMapData.rewards.push({
            no: (activeMapData.rewards.length + 1).toString(),
            cumulative: lastCum + 10,
            unlockEl: '新獎勵',
            song: '',
            isSongOnly: false,
            reward: '新獎勵'
          });
          refreshUI();
        };
      }

      document.querySelectorAll('.chiho-edit-del').forEach(btn => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx, 10);
          activeMapData.rewards.splice(idx, 1);
          refreshUI();
        };
      });

      document.querySelectorAll('.chiho-edit-name').forEach(input => {
        input.oninput = (e) => {
          const idx = parseInt(input.dataset.idx, 10);
          activeMapData.rewards[idx].reward = e.target.value;
          activeMapData.rewards[idx].unlockEl = e.target.value;
          // 即時反映至底層標籤，不重繪輸入框以免失去焦點
          const liveProcessed = getProcessRewards(activeMapData.rewards);
          const liveMap = alignRewardsToBlocks(liveProcessed, rewardBlocks);
          injectToPage(liveProcessed, searchKm, completedIndices, nextIdx, liveMap);
        };
      });

      document.querySelectorAll('.chiho-edit-cum').forEach(input => {
        input.oninput = (e) => {
          const idx = parseInt(input.dataset.idx, 10);
          activeMapData.rewards[idx].cumulative = parseInt(e.target.value, 10) || 0;
          const liveProcessed = getProcessRewards(activeMapData.rewards);
          const liveMap = alignRewardsToBlocks(liveProcessed, rewardBlocks);
          injectToPage(liveProcessed, searchKm, completedIndices, nextIdx, liveMap);
        };
        input.onblur = () => {
          refreshUI();
        };
      });
    }

    function escapeHtml(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // ── 10. 顯示結果 HTML 生成 ──
    function displayResults(processedRewards, km, container, completedIndices, nextIdx, wikiToDomMap) {
      const done = nextIdx === -1 ? processedRewards.length : nextIdx;
      const maxCum = processedRewards[processedRewards.length - 1]?.cumulative || 1;
      const pct = Math.min(100, (km / maxCum) * 100);

      let h = `
      <div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.18); border-radius:8px; padding:8px 12px; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
        <span>✅</span><span style="color:#86efac; font-size:12px;">來源：<b>${activeMapData.source}</b>（共 ${processedRewards.length} 個獎勵）</span>
      </div>
      <div style="background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.12); border-radius:10px; padding:10px 14px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="font-size:11px; color:#64748b;">總進度</span>
          <span style="font-size:12px; color:#818cf8; font-weight:600;">${done}/${processedRewards.length} 已達成 · ${pct.toFixed(1)}%</span>
        </div>
        <div style="height:5px; background:rgba(99,102,241,0.12); border-radius:3px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:#6366f1; border-radius:3px;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:10px; color:#475569;">
          <span>${km.toLocaleString()} Km</span><span>${maxCum.toLocaleString()} Km</span>
        </div>
      </div>
      
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding:0 4px;">
        <span style="font-size:11px; color:#94a3b8; font-weight:600;">🗺️ 地圖獎勵與距離列表</span>
        <button id="chiho-toggle-edit" style="
          background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.3);
          color:#818cf8; border-radius:6px; padding:3px 10px; cursor:pointer; font-size:11px;
          transition:all 0.2s;
        ">
          ${isEditing ? '💾 完成編輯' : '✏️ 編輯列表'}
        </button>
      </div>

      <div style="border-radius:10px; overflow:hidden; border:1px solid rgba(99,102,241,0.1); background:rgba(15,23,42,0.3);">
    `;

      if (isEditing) {
        // 編輯模式：對原始 raw list 進行編輯
        activeMapData.rewards.forEach((r, i) => {
          const displayName = r.unlockEl && r.song && r.song !== '—' && r.song !== ''
            ? `${r.unlockEl} [${r.song}]`
            : (r.unlockEl || r.reward);
          h += `
          <div style="padding:6px 10px; border-bottom:1px solid rgba(99,102,241,0.06); display:flex; align-items:center; gap:6px;">
            <span style="font-size:11px; color:#475569; width:26px; text-align:center;">#${i + 1}</span>
            <input class="chiho-edit-name" data-idx="${i}" type="text" value="${escapeHtml(displayName)}" placeholder="獎勵名稱" style="
              flex:1; padding:5px 8px; border-radius:6px; border:1px solid rgba(99,102,241,0.2);
              background:rgba(10,15,26,0.8); color:#e2e8f0; font-size:12px; outline:none;
            ">
            <input class="chiho-edit-cum" data-idx="${i}" type="number" value="${r.cumulative}" placeholder="累積Km" style="
              width:65px; padding:5px 4px; border-radius:6px; border:1px solid rgba(99,102,241,0.2);
              background:rgba(10,15,26,0.8); color:#fbbf24; font-size:12px; outline:none; text-align:center;
            ">
            <span style="font-size:11px; color:#64748b; flex-shrink:0;">Km</span>
            <button class="chiho-edit-del" data-idx="${i}" style="
              background:rgba(239,68,68,0.15); border:none; color:#f87171;
              border-radius:6px; padding:5px 8px; cursor:pointer; font-size:11px;
            ">🗑️</button>
          </div>
        `;
        });
        h += `
        <div style="padding:10px; text-align:center; background:rgba(10,15,26,0.4);">
          <button id="chiho-edit-add" style="
            background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.3);
            color:#4ade80; border-radius:6px; padding:6px 16px; cursor:pointer; font-size:12px;
          ">➕ 新增獎勵欄位</button>
        </div>
      `;
      } else {
        // 唯讀列表模式
        processedRewards.forEach((r, i) => {
          const rem = r.cumulative - km;
          const isDone = isRewardDone(i, r.cumulative, km, wikiToDomMap ? wikiToDomMap[i] : i);
          const isNext = i === nextIdx;
          const prevCum = i > 0 ? processedRewards[i - 1].cumulative : 0;
          const seg = r.cumulative - prevCum;
          const segDone = Math.max(0, Math.min(seg, km - prevCum));
          const segPct = seg > 0 ? Math.min(100, (segDone / seg) * 100) : (isDone ? 100 : 0);
          const bg = isDone ? 'rgba(34,197,94,0.05)' : isNext ? 'rgba(251,191,36,0.05)' : 'rgba(15,23,42,0.3)';
          const bl = isDone ? '#22c55e' : isNext ? '#fbbf24' : 'transparent';
          const pc = isDone ? '#22c55e' : isNext ? '#fbbf24' : '#6366f1';
          const icon = isDone ? '✅' : isNext ? '🎯' : '⏳';
          const remT = isDone ? '<span style="color:#22c55e;font-weight:600;font-size:11px;">已達成</span>'
            : `<span style="color:${isNext ? '#fbbf24' : '#94a3b8'};font-weight:${isNext ? '600' : '400'};font-size:${isNext ? '13px' : '11px'};">${rem.toLocaleString()} km</span>`;

          h += `<div style="padding:8px 12px; background:${bg}; border-left:3px solid ${bl}; border-bottom:1px solid rgba(99,102,241,0.06); display:flex; align-items:center; gap:8px;">
          <span style="font-size:13px; width:20px; text-align:center;">${icon}</span>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:baseline; gap:5px; margin-bottom:2px;">
              <span style="font-size:10px; color:#475569; width:24px;">No.${r.no || i + 1}</span>
              <span style="font-size:12px; color:#e2e8f0; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;" title="${r.displayName}">${r.displayName}</span>
              <span style="font-size:10px; color:#64748b; flex-shrink:0;">@ ${r.cumulative.toLocaleString()} km</span>
            </div>
            <div style="height:3px; background:rgba(99,102,241,0.1); border-radius:2px; overflow:hidden;">
              <div style="height:100%; width:${segPct}%; background:${pc}; border-radius:2px;"></div>
            </div>
          </div>
          <div style="min-width:65px; text-align:right;">${remT}</div>
        </div>`;
        });
      }

      h += '</div>';
      container.innerHTML = h;
    }

    // ── 11. 在獎勵圖標下方注入距離標籤 ──
    function injectToPage(processedRewards, km, completedIndices, nextIdx, wikiToDomMap) {
      document.querySelectorAll('.chiho-dist-lbl').forEach(el => el.remove());

      // 獎勵圖標在 .see_through_area .basic_block 中
      const blocks = document.querySelectorAll('.see_through_area .basic_block');
      if (!blocks.length || !processedRewards.length) return;

      for (let i = 0; i < processedRewards.length; i++) {
        const domIdx = wikiToDomMap ? wikiToDomMap[i] : i;
        if (domIdx === undefined || domIdx === -1 || domIdx >= blocks.length) {
          continue;
        }
        const block = blocks[domIdx];

        // 移除 GET / NEXT 圖標
        block.querySelectorAll('.mapdetail_bonus_icon').forEach(img => img.remove());

        const r = processedRewards[i];
        const rem = r.cumulative - km;

        const lbl = document.createElement('div');
        lbl.className = 'chiho-dist-lbl';

        const isDone = isRewardDone(i, r.cumulative, km, domIdx);

        if (isDone) {
          lbl.style.cssText = `
          text-align:center; font-size:10px; line-height:1.3;
          color:#fff; background:#22c55e;
          border-radius:6px; padding:3px 6px; margin-top:4px;
          font-weight:700; text-shadow:0 1px 2px rgba(0,0,0,0.3);
          box-shadow:0 2px 6px rgba(34,197,94,0.3);
        `;
          lbl.textContent = '✅ 已達成';
        } else {
          const isNext = i === nextIdx;
          lbl.style.cssText = `
          text-align:center; font-size:10px; line-height:1.3;
          color:#fff; background:#f59e0b;
          border-radius:6px; padding:3px 6px; margin-top:4px;
          font-weight:700; text-shadow:0 1px 2px rgba(0,0,0,0.3);
          box-shadow:0 2px 6px rgba(245,158,11,0.3);
        `;
          lbl.textContent = isNext ? `🎯 剩 ${rem.toLocaleString()} km` : `剩 ${rem.toLocaleString()} km`;
        }

        block.appendChild(lbl);
      }

      console.log(`[Chiho] ✅ 已在獎勵圖標下方注入距離標籤，並移除了 GET/NEXT 圖標`);
    }

    // ── 12. 自動查詢 ──
    if (mapName) {
      setTimeout(() => document.getElementById('chiho-search-btn')?.click(), 300);
    }

  })();
