#!/bin/bash
# HTTPS für den Dev-Server im WLAN (Zonen-Editor auf dem iPad, docs/ZONENEDITOR-PLAN.md, Entscheidung A7).
#
# Legt eine eigene kleine Zertifizierungsstelle (CA) und ein Server-Zertifikat an, für localhost, den Bonjour-Namen des
# Macs (<Name>.local) und seine WLAN-Adressen. Alles liegt in <Haupt-Checkout>/.certs (nicht im Repository), damit alle
# Worktrees dieselbe CA nutzen. Am Mac wird nichts installiert und keiner Stelle vertraut (dort reicht localhost); auf
# dem iPad installiert Florian rootCA.pem einmal als Profil und vertraut ihm voll (Einstellungen › Allgemein › Info ›
# Zertifikatsvertrauenseinstellungen).
#
# Die CA darf nur lokale Namen und Heimnetz-Adressen bestätigen (Namensbeschränkung), damit ihr Schlüssel nicht für
# fremde Seiten taugt; der Schlüssel rootCA.key verlässt den Mac nie.
#
# Erneut ausführen, wenn sich die WLAN-Adresse ändert: Dann entsteht nur ein neues Server-Zertifikat, die CA und das
# Profil auf dem iPad bleiben gültig.
set -euo pipefail

main="$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
dir="$main/.certs"
mkdir -p "$dir"
chmod 700 "$dir"
cd "$dir"

host="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
ips=""
for i in en0 en1 en2 en3; do
  ip="$(ipconfig getifaddr "$i" 2>/dev/null || true)"
  [ -n "$ip" ] && ips="$ips $ip"
done

if [ ! -f rootCA.pem ] || [ ! -f rootCA.key ]; then
  cat > ca.cnf <<EOF
[req]
distinguished_name = dn
x509_extensions = v3_ca
prompt = no
[dn]
CN = Trauma Coaster Dev CA ($host)
O = Trauma Coaster Entwicklung
[v3_ca]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
nameConstraints = permitted;DNS:localhost, permitted;DNS:local, permitted;IP:127.0.0.0/255.0.0.0, permitted;IP:10.0.0.0/255.0.0.0, permitted;IP:172.16.0.0/255.240.0.0, permitted;IP:192.168.0.0/255.255.0.0
EOF
  openssl genrsa -out rootCA.key 3072 2>/dev/null
  chmod 600 rootCA.key
  openssl req -x509 -new -key rootCA.key -sha256 -days 3650 -config ca.cnf -out rootCA.pem
  echo "Neue CA angelegt: $dir/rootCA.pem (einmal aufs iPad, dort als Profil installieren und voll vertrauen)"
fi

san="DNS:localhost, DNS:$host.local, IP:127.0.0.1"
for ip in $ips; do san="$san, IP:$ip"; done
cat > dev.ext <<EOF
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = $san
EOF
openssl genrsa -out dev.key 2048 2>/dev/null
chmod 600 dev.key
openssl req -new -key dev.key -subj "/CN=$host.local" -out dev.csr
# iOS nimmt Server-Zertifikate eigener CAs nur bis 825 Tage; 397 Tage halten auch strengere Regeln ein
openssl x509 -req -in dev.csr -CA rootCA.pem -CAkey rootCA.key -CAcreateserial -days 397 -sha256 -extfile dev.ext -out dev.pem 2>/dev/null
rm -f dev.csr

echo "Server-Zertifikat für: $san"
echo "Dev-Server mit HTTPS: npm run dev:https, dann auf dem iPad https://$host.local:5180/"
