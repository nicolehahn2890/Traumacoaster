"""Kamerawinkel-Test: dist/index.html -> dist/kamerawinkel.html für ein claude.ai-Artifact.

Das Artifact legt doctype/html/head/body selbst an, darum nur der Inhalt. Es reicht keine Adressparameter durch, darum
setzt ein kleines Skript vor dem Spiel die Startparameter: Standard ist die Ebenen-Zone „scheiben“, #probe, #basiszone
oder #level5 (Level im Weltrenderer) wählen etwas anderes; ein angehängtes -fps (#scheiben-fps) zeigt fps und Draw Calls.

    python3 scripts/artifact-page.py dist/index.html dist/kamerawinkel.html
"""
import re
import sys

src = open(sys.argv[1]).read()
head = re.search(r'<head>(.*)</head>', src, re.S).group(1)
body = re.search(r'<body>(.*)</body>', src, re.S).group(1)
# Viewport bringt das Gerüst mit (viewport-fit=cover); Manifest und Touch-Icon gelten im Artifact nicht
head = re.sub(r'\s*<meta\s+name="viewport"[^>]*/>', '', head, flags=re.S)
head = re.sub(r'\s*<link rel="(manifest|apple-touch-icon)"[^>]*/>', '', head)
head = re.sub(r'\s*<!--.*?-->', '', head, flags=re.S)
head = head.replace('<title>Trauma Coaster</title>', '<title>Trauma Coaster Kamerawinkel</title>')
defaults = '''<script>
  (function () {
    try {
      var u = new URL(location.href);
      var h = (location.hash || '').replace('#', '');
      var fps = /-fps$/.test(h) || h === 'fps';
      h = h.replace(/-?fps$/, '');
      var m = /^level(\\d+)$/.exec(h);
      if (!u.searchParams.has('zone') && !u.searchParams.has('level')) {
        if (m) { u.searchParams.set('level', m[1]); u.searchParams.set('world', '1'); }
        else u.searchParams.set('zone', /^[a-z0-9-]{1,40}$/.test(h) ? h : 'scheiben');
        if (fps) u.searchParams.set('dev', '1');
        history.replaceState(null, '', u.toString());
      }
    } catch (err) { /* ohne Parameter startet das Spiel normal */ }
  })();
</script>'''
open(sys.argv[2], 'w').write(defaults + '\n' + head.strip() + '\n' + body.strip() + '\n')
