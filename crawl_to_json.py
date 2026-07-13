import re
import urllib.request
import urllib.parse
from bs4 import BeautifulSoup
import json
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

# ── 工具函數 ──

def clean_str(s):
    """字串正規化：移除空白、括弧等符號後轉小寫"""
    if not s:
        return ""
    return (s.lower()
            .replace(" ", "").replace("\u3000", "")
            .replace("-", "").replace("－", "")
            .replace("~", "").replace("～", "")
            .replace("_", "").replace(".", "")
            .replace("「", "").replace("」", "")
            .replace("『", "").replace("』", "")
            .replace("【", "").replace("】", "")
            .replace("(", "").replace(")", "")
            .replace("（", "").replace("）", "")
            .replace("[", "").replace("]", "")
            .replace("*", ""))

def is_match(raw1, raw2):
    """版本感知的字串比對：數字版本不同則一定不匹配"""
    s1 = clean_str(raw1)
    s2 = clean_str(raw2)
    if not s1 or not s2:
        return False
    if s1 == s2:
        return True
    num1 = "".join(re.findall(r'\d+', s1))
    num2 = "".join(re.findall(r'\d+', s2))
    if num1 != num2:
        return False
    return s1 in s2 or s2 in s1

def p_km(s):
    """解析距離字串為整數（移除逗號和空白）"""
    if not s:
        return None
    try:
        val = s.replace(",", "").replace(" ", "").strip()
        return int(val)
    except:
        return None

# ── 表格解析 ──

def is_valid_distance_table(table):
    """判斷是否為有效的距離獎勵表格（需包含「距離」和「報酬」欄位）"""
    first_row = table.find('tr')
    if not first_row:
        return False
    text = first_row.get_text()
    return "距離" in text and "報酬" in text

def parse_table(table):
    """解析 Wiki 距離表格，產出 rewards 陣列（新 4 欄格式，支援 rowspan/colspan）"""
    rows = table.find_all('tr')
    if not rows:
        return []

    # 計算表格最大列數
    max_cols = 0
    for row in rows:
        cols_in_row = 0
        for cell in row.find_all(['td', 'th']):
            cols_in_row += int(cell.get('colspan', 1))
        if cols_in_row > max_cols:
            max_cols = cols_in_row

    if max_cols == 0:
        return []

    # 初始化與填充 2D 網格以攤平 rowspan/colspan
    grid = [[None] * max_cols for _ in range(len(rows))]

    for r_idx, row in enumerate(rows):
        c_idx = 0
        for cell in row.find_all(['td', 'th']):
            while c_idx < max_cols and grid[r_idx][c_idx] is not None:
                c_idx += 1
            if c_idx >= max_cols:
                break

            rowspan = int(cell.get('rowspan', 1))
            colspan = int(cell.get('colspan', 1))

            for r in range(rowspan):
                for c in range(colspan):
                    if r_idx + r < len(rows) and c_idx + c < max_cols:
                        grid[r_idx + r][c_idx + c] = cell
            c_idx += colspan

    # 讀取 header 資訊
    headers = [cell.get_text().strip().lower() if cell else "" for cell in grid[0]]

    # 辨識欄位索引
    cum_idx = -1
    type_idx = -1
    reward_idx = -1

    # 優先尋找包含 km 的距離欄位（例如 距離[km]），避免誤用舊版的 距離[m]
    for idx, h in enumerate(headers):
        if "km" in h:
            cum_idx = idx
            break

    if cum_idx == -1:
        for idx, h in enumerate(headers):
            if "距離" in h or "累計" in h:
                cum_idx = idx
                break
    if cum_idx == -1:
        cum_idx = 0

    for idx, h in enumerate(headers):
        if "種類" in h:
            type_idx = idx
            break

    for idx, h in enumerate(headers):
        if h == "報酬" or "解禁" in h or "要素" in h:
            reward_idx = idx
            break
    if reward_idx == -1:
        for idx, h in enumerate(headers):
            if "報酬" in h and "種類" not in h:
                reward_idx = idx
                break
    if reward_idx == -1:
        reward_idx = 2

    # 解析資料列
    parsed_rewards = []
    seq = 1
    for r_idx in range(1, len(rows)):
        row_cells = grid[r_idx]
        cum_cell = row_cells[cum_idx]
        type_cell = row_cells[type_idx] if type_idx != -1 else None
        reward_cell = row_cells[reward_idx]

        if not cum_cell or not reward_cell:
            continue

        cum_val = cum_cell.get_text().strip()
        type_val = type_cell.get_text().strip() if type_cell else ""
        reward_val = reward_cell.get_text().strip()

        cum = p_km(cum_val)
        if cum is not None and cum >= 0:
            clean_reward = reward_val.replace("—", "").strip()
            if not clean_reward:
                continue

            parsed_rewards.append({
                "no": seq,
                "cumulative": cum,
                "type": type_val,
                "name": clean_reward
            })
            seq += 1

    return parsed_rewards

# ── 地圖定位與解析 ──

def parse_map(html, target, hash_val):
    """在頁面 HTML 中定位目標地圖 heading，找到其下方的距離表格並解析"""
    soup = BeautifulSoup(html, 'html.parser')
    headings = soup.find_all(['h2', 'h3', 'h4'])

    found = None

    # 優先用 URL hash 定位
    if hash_val:
        try:
            decoded_hash = urllib.parse.unquote(hash_val)
            el = soup.find(id=decoded_hash)
            if not el:
                for tag in soup.find_all(True):
                    tag_id = tag.get('id', '')
                    if tag_id and decoded_hash in tag_id:
                        el = tag
                        break
            if el:
                if el.name in ['h2', 'h3', 'h4']:
                    found = el
                else:
                    found = el.find(['h2', 'h3', 'h4']) or el.find_parent(['h2', 'h3', 'h4'])
        except Exception as e:
            print(f"Hash parsing error: {e}")

    # 備用：is_match 搜尋 headings
    if not found:
        for h in headings:
            if is_match(h.get_text(), target):
                found = h
                break

    # 若都找不到且頁面只有一個 table，直接解析
    if not found:
        tables = soup.find_all('table')
        if len(tables) == 1:
            rewards = parse_table(tables[0])
            if rewards:
                return rewards
        return None

    # 向下遍歷 heading 的 sibling，找到有效的距離表格
    rewards = []
    el = found.next_sibling
    while el:
        if el.name in [found.name, 'h2', 'h1']:
            break
        if el.name == 'table':
            if is_valid_distance_table(el):
                rewards.extend(parse_table(el))
        else:
            if hasattr(el, 'find_all'):
                for t in el.find_all('table'):
                    if is_valid_distance_table(t):
                        rewards.extend(parse_table(t))
        if rewards:
            break
        el = el.next_sibling

    return rewards if rewards else None

# ── 主流程 ──

# 從 JS 檔案中抽取 G_CHIHO_MAP
print("Extracting map from chiho_distance_calculator.js...")
with open("chiho_distance_calculator.js", "r", encoding="utf-8") as f:
    js_content = f.read()

map_match = re.search(r'const G_CHIHO_MAP = \{(.*?)\};', js_content, re.DOTALL)
if not map_match:
    print("Failed to find G_CHIHO_MAP in JS file!")
    sys.exit(1)

map_str = map_match.group(1)
entries = re.findall(r'"([^"]+)":\s*"([^"]+)"', map_str)
chiho_map = {name: url for name, url in entries}
print(f"Extracted {len(chiho_map)} chihos.")

# 按 base URL 分組以減少 HTTP 請求
grouped = {}
for name, url in chiho_map.items():
    parts = url.split('#')
    base_url = parts[0]
    hash_val = parts[1] if len(parts) > 1 else ""
    if base_url not in grouped:
        grouped[base_url] = []
    grouped[base_url].append((name, hash_val))

# 逐頁抓取並解析
results = {}
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
total_urls = len(grouped)
completed = 0

for base_url, items in grouped.items():
    completed += 1
    print(f"[{completed}/{total_urls}] Fetching page: {base_url}")
    req = urllib.request.Request(base_url, headers=headers)
    html = None
    try:
        with urllib.request.urlopen(req) as resp:
            html = resp.read().decode('utf-8')
    except Exception as e:
        print(f"Failed to fetch {base_url}: {e}")
        time.sleep(1)
        try:
            with urllib.request.urlopen(req) as resp:
                html = resp.read().decode('utf-8')
        except Exception as e:
            print(f"Retry failed for {base_url}: {e}")
            continue

    if html:
        for name, hash_val in items:
            print(f"  Parsing chiho: {name} (Hash: {hash_val})")
            rewards = parse_map(html, name, hash_val)
            if rewards:
                results[name] = {
                    "mapName": name,
                    "rewards": rewards
                }
                print(f"    Success: found {len(rewards)} rewards.")
            else:
                print(f"    Warning: No rewards found for {name}!")

    time.sleep(0.3)

# 輸出資料庫
with open("chiho_data.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"Scraped and compiled {len(results)} chihos to chiho_data.json.")
