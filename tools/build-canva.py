#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""slides.html から Canva 取り込み用の slides.pptx を作る。

使い方:  python3 tools/build-canva.py

なぜPPTXなのか:
  CanvaのHTML取り込みは中身を抜き出して組み直すので、図版が落ちて判型も崩れる。
  PDF取り込みは見た目は保てるが、文字以外がすべて1枚の画像に潰れて、
  ボックスも図版も動かせない。PPTXなら図形・テキスト・画像がそれぞれ
  ネイティブ要素として入り、位置も色も個別に編集できる。

できたら:
  slides.pptx をコミットして push し、**コミットのSHAを指した raw URL** で
  Canvaに取り込む（main を指すとCDNのキャッシュで古いものが返る）。
"""
import io, os, json, re, subprocess, sys, shutil, hashlib, tempfile, http.server, socketserver, threading

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(REPO, 'tools')
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT = 8791
# ヘッドレスChromeの --window-size はブラウザ枠を含むので、innerHeight が810になる値を渡す
WINDOW = "1440,897"

def log(*a): print(*a, flush=True)

def serve(root):
    os.chdir(root)
    h = http.server.SimpleHTTPRequestHandler
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), h)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

def chrome(args):
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars"] + args,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)

def make_measure_page(work):
    """slides.html を「全ページを縦に並べた1440x810」に直し、測定スクリプトを差し込む"""
    src = io.open(os.path.join(REPO, 'slides.html'), encoding='utf-8').read()
    css = """
<style>
html,body{height:auto; overflow:visible;}
.slide{display:flex !important; position:relative !important; inset:auto !important;
       width:100vw; height:100vh;}
#partChip,#pageNum,#navHint,#progress{display:none !important;}
</style>
"""
    src = src.replace("</head>", css + "</head>", 1)
    src = re.sub(r'<script>.*?</script>', '', src, flags=re.S)
    js = io.open(os.path.join(TOOLS, 'measure.js'), encoding='utf-8').read()
    src = src.replace("</body>", '<pre id="__out" style="display:none"></pre><script>%s</script></body>' % js, 1)
    io.open(os.path.join(work, 'measure.html'), 'w', encoding='utf-8').write(src)
    # 図版は相対パスで参照されるので、作業フォルダから見えるようにする
    link = os.path.join(work, 'slides')
    if not os.path.exists(link):
        os.symlink(os.path.join(REPO, 'slides'), link)

def measure(work):
    out = subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
                          "--window-size=" + WINDOW, "--virtual-time-budget=25000", "--dump-dom",
                          "http://127.0.0.1:%d/measure.html" % PORT],
                         capture_output=True, text=True).stdout
    m = re.search(r'###JSON###(.*?)###END###', out, re.S)
    if not m:
        sys.exit("測定に失敗しました。Chromeのパスとポートを確認してください。")
    data = json.loads(m.group(1))
    io.open(os.path.join(work, 'full.json'), 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False))
    return data

def render_icons(work, data):
    """アイコンは (種類, 色) ごとに透過PNGへ。線画が多く、図形に起こすと崩れるため"""
    html = io.open(os.path.join(REPO, 'slides.html'), encoding='utf-8').read()
    seen, uniq = set(), []
    for s in re.findall(r'<symbol id="ic-[a-z]+".*?</symbol>', html, re.S):
        i = re.search(r'id="(ic-[a-z]+)"', s).group(1)
        if i not in seen:
            seen.add(i); uniq.append(s)
    sprite = '<svg style="display:none">' + ''.join(uniq) + '</svg>'
    pairs = {}
    for p in data['pages']:
        for it in p['items']:
            if it['k'] == 'icon' and it.get('ref'):
                key = (it['ref'].lstrip('#'), it['col'])
                pairs.setdefault(key, hashlib.md5(('%s|%s' % key).encode()).hexdigest()[:10])
    d = os.path.join(work, 'icons'); os.makedirs(d, exist_ok=True)
    for (sid, col), name in pairs.items():
        io.open(os.path.join(d, name + '.html'), 'w', encoding='utf-8').write(
            '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}'
            'svg{display:block;width:128px;height:128px;color:%s}</style>%s'
            '<svg viewBox="0 0 24 24"><use href="#%s"/></svg>' % (col, sprite, sid))
    for name in pairs.values():
        chrome(["--default-background-color=00000000", "--window-size=128,128",
                "--screenshot=" + os.path.join(d, name + '.png'),
                "http://127.0.0.1:%d/icons/%s.html" % (PORT, name)])
    io.open(os.path.join(work, 'icon_map.json'), 'w', encoding='utf-8').write(
        json.dumps({'%s|%s' % k: v for k, v in pairs.items()}, ensure_ascii=False))
    log("アイコン:", len(pairs), "種")

def main():
    if not os.path.exists(CHROME): sys.exit("Google Chrome が見つかりません: " + CHROME)
    try: import pptx  # noqa
    except ImportError: sys.exit("python-pptx が要ります:  python3 -m pip install python-pptx")
    work = tempfile.mkdtemp(prefix="tobira-canva-")
    log("作業フォルダ:", work)
    make_measure_page(work)
    httpd = serve(work)
    try:
        data = measure(work)
        n = {}
        for p in data['pages']:
            for it in p['items']: n[it['k']] = n.get(it['k'], 0) + 1
        log("ページ:", len(data['pages']), " 要素:", n)
        render_icons(work, data)
        env = dict(os.environ, TOBIRA_WORK=work, TOBIRA_REPO=REPO)
        subprocess.run([sys.executable, os.path.join(TOOLS, 'build_pptx.py')], env=env, check=True)
        shutil.copy(os.path.join(work, 'slides.pptx'), os.path.join(REPO, 'slides.pptx'))
        log("できました:", os.path.join(REPO, 'slides.pptx'))
    finally:
        httpd.shutdown()

if __name__ == '__main__':
    main()
