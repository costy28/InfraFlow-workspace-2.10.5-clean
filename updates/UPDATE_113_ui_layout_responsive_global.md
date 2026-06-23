# UPDATE 113 - UI layout responsive global

Versiune: 2.12.92 -> 2.12.93
Data: 2026-06-22

## Modificari

- Shell-ul aplicatiei foloseste clase dedicate pentru izolarea overflow-ului orizontal.
- Zona principala limiteaza continutul la latimea disponibila si previne scroll-ul orizontal pe pagina.
- Tabelele aflate direct in carduri sau containere primesc scroll local automat.
- Header-ul paginilor foloseste `module-toolbar`, cu actiuni care se strang corect pe mobil.
- Bara superioara este mai compacta pe mobil: titlul se trunchiaza, notificarea se ascunde pe ecrane foarte mici, iar butonul de iesire ramane compact.
- Componenta standard `Table` pastreaza header-ele si actiunile compacte, cu text lung controlat in celule.

## Verificare

- `npm run build` in `client`
- `npm run check` in `server`
