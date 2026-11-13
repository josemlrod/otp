# Every recent result of seven followed clubs, through this branch's /api/clubs/:id/matches/:id
# against the real APIs. Paced under football-data's free-tier limit (10 requests a minute).
import json, time, urllib.request
P = 44391
def get(p):
    try: return json.load(urllib.request.urlopen(f"http://localhost:{P}{p}"))
    except Exception as e: return str(e)
seen, rows, misses = set(), [], []
for club in (397, 64, 5, 108, 86, 524, 81):
    d = get(f"/api/clubs/{club}/matches"); time.sleep(7)
    if isinstance(d, str): print("club", club, d, flush=True); continue
    for m in d['form']:
        if m['id'] in seen: continue
        seen.add(m['id'])
        r = get(f"/api/clubs/{club}/matches/{m['id']}"); time.sleep(7)
        if isinstance(r, str): print("  ", m['id'], r, flush=True); misses.append(m['id']); continue
        ev = r['events'] or []; g = [e for e in ev if e['kind'] == 'goal']
        full = bool(r['lineups'] and r['momentum'] and r['stats'] and r['events'] is not None)
        if not full or len(g) != sum(r['fullTime']): misses.append(m['id'])
        lu = r['lineups']
        print(f"{r['competition']:3} {r['home']['name'][:15]:15} {r['fullTime'][0]}-{r['fullTime'][1]} {r['away']['name'][:15]:15} "
              f"goals {len(g)}/{sum(r['fullTime'])}  assists {sum(1 for x in g if x['assist'])}  cards {sum(e['kind']=='card' for e in ev):2}  subs {sum(e['kind']=='sub' for e in ev):2}  "
              f"xG {r['stats']['xg'][0]:.2f}-{r['stats']['xg'][1]:.2f}  momentum {len(r['momentum'] or [])}  "
              f"lineups {lu['home']['formation']} v {lu['away']['formation'] if lu else '-'}  added +{r['firstHalfInjuryTime']}/+{r['injuryTime']}", flush=True)
print(f"\n{len(seen) - len(misses)}/{len(seen)} matches found on FotMob with every goal, stats, lineups and momentum")
