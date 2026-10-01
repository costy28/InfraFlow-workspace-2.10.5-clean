# UPDATE 629 — v2.12.609 — Worker Linux verificat și auto-reîmprospătat

## Corecție

Workerul root de update se află în `/usr/local/lib/infraflow`, separat de
fișierele aplicației. În versiunile inițiale el nu era înlocuit automat când
arhiva aplicației era actualizată.

## Garanții noi

- pachetul trebuie să aibă o versiune strict mai nouă decât versiunea instalată;
- după `npm ci`, workerul verifică încărcarea `mssql`, `https-proxy-agent` și
  `sprintf-js` înainte de pornirea aplicației;
- versiunea din `version.json` trebuie să corespundă pachetului extras;
- health endpoint-ul trebuie să răspundă înainte de confirmarea update-ului;
- după succes, workerul și unitățile systemd sunt actualizate pentru următoarea
  rulare.

## Bootstrap unic

Instanțele care au workerul vechi necesită o reîmprospătare manuală, controlată,
o singură dată. Aceasta se face numai când aplicația curentă este online.
