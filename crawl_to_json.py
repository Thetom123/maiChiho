import re
import urllib.request
import urllib.parse
from bs4 import BeautifulSoup
import json
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

def clean_str(s):
    if not s:
        return ""
    return (s.lower()
            .replace(" ", "")
            .replace("\u3000", "")
            .replace("-", "")
            .replace("－", "")
            .replace("~", "")
            .replace("～", "")
            .replace("_", "")
            .replace(".", "")
            .replace("「", "")
            .replace("」", "")
            .replace("『", "")
            .replace("』", "")
            .replace("【", "")
            .replace("】", "")
            .replace("(", "")
            .replace(")", "")
            .replace("（", "")
            .replace("）", "")
            .replace("[", "")
            .replace("]", "")
            .replace("*", ""))

def is_bracketed(s):
    if not s:
        return False
    s = s.strip()
    start_chars = ['（', '(', '〈', '《', '<']
    end_chars = ['）', ')', '〉', '》', '>']
    for i in range(len(start_chars)):
        if s.startswith(start_chars[i]) and s.endswith(end_chars[i]):
            return True
    return False

def check_is_song(text):
    if not text:
        return False
    trimmed = text.strip()
    if is_bracketed(trimmed):
        return True
    non_song_keywords = ['背景', '名牌板', '底板', '頭像', '旅伴', 'チケット', 'ちほー', 'icon', 'frame', 'plate', 'ticket', '券', '角色', '旅行相手']
    cleaned = trimmed.lower()
    for kw in non_song_keywords:
        if kw in cleaned:
            return False
    return True

def p_km(s):
    if not s:
        return None
    try:
        val = s.replace(",", "").replace(" ", "").strip()
        return int(val)
    except:
        return None

def is_valid_distance_table(table):
    first_row = table.find('tr')
    if not first_row:
        return False
    text = first_row.get_text()
    return "距離" in text and "報酬" in text

def parse_table(table):
    rows = table.find_all('tr')
    if len(rows) < 2:
        return []
    
    headers = []
    first_cells = rows[0].find_all(['th', 'td'])
    for cell in first_cells:
        colspan = int(cell.get('colspan', 1))
        text = cell.get_text().strip().lower()
        for _ in range(colspan):
            headers.append(text)
            
    cum_idx = -1
    type_idx = -1
    reward_idx = -1
    
    for idx, h in enumerate(headers):
        if "距離" in h or "累計" in h or "km" in h:
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
        
    parsed_rewards = []
    for i in range(1, len(rows)):
        cells = rows[i].find_all(['td', 'th'])
        if len(cells) <= max(cum_idx, type_idx, reward_idx):
            continue
            
        cum_val = cells[cum_idx].get_text().strip()
        type_val = cells[type_idx].get_text().strip() if type_idx != -1 else ""
        reward_val = cells[reward_idx].get_text().strip()
        
        cum = p_km(cum_val)
        if cum is not None and cum >= 0:
            clean_reward = reward_val.replace("—", "").strip()
            if not clean_reward:
                continue
                
            is_song = "楽曲" in type_val or "曲名" in type_val or check_is_song(clean_reward)
            parsed_rewards.append({
                "no": str(i),
                "cumulative": cum,
                "unlockEl": clean_reward,
                "song": clean_reward if is_song else "",
                "isSongOnly": is_song,
                "reward": clean_reward
            })
    return parsed_rewards

def parse_map(html, target, hash_val):
    soup = BeautifulSoup(html, 'html.parser')
    headings = soup.find_all(['h2', 'h3', 'h4'])
    cleaned_target = clean_str(target)
    
    found = None
    if hash_val:
        try:
            decoded_hash = urllib.parse.unquote(hash_val)
            el = soup.find(id=decoded_hash)
            if not el:
                # partial matching
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
            
    if not found:
        for h in headings:
            h_text = clean_str(h.get_text())
            if h_text == cleaned_target or h_text in cleaned_target or cleaned_target in h_text:
                found = h
                break
                
    if not found:
        tables = soup.find_all('table')
        if len(tables) == 1:
            rewards = parse_table(tables[0])
            if rewards:
                return rewards
        return None
        
    rewards = []
    el = found.next_sibling
    while el:
        if el.name in [found.name, 'h2', 'h1']:
            break
        if el.name == 'table':
            if is_valid_distance_table(el):
                rewards.extend(parse_table(el))
        else:
            # find nested tables
            if hasattr(el, 'find_all'):
                for t in el.find_all('table'):
                    if is_valid_distance_table(t):
                        rewards.extend(parse_table(t))
        if rewards:
            break
        el = el.next_sibling
        
    return rewards if rewards else None

# Load G_CHIHO_MAP from JS
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

# Group by base URL to minimize requests
grouped = {}
for name, url in chiho_map.items():
    parts = url.split('#')
    base_url = parts[0]
    hash_val = parts[1] if len(parts) > 1 else ""
    if base_url not in grouped:
        grouped[base_url] = []
    grouped[base_url].append((name, hash_val))

# Scrape
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
        # Try once more after sleep
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
                
    time.sleep(0.3) # Friendly delay

# Save database
with open("chiho_data.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"Scraped and compiled {len(results)} chihos to chiho_data.json.")
