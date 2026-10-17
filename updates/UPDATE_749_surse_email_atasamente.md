# UPDATE 749 — Surse Email și atașamente controlate

Versiune: **2.12.729**

Serializerul Email primește contextul autorizat. Sursele Contract/Document/Task folosesc aceeași rezolvare ca legăturile; sursele Email cer mesaj existent și consultabil. Sursele CRM quote/lead/order cer permisiunea dedicată, mod relațional și înregistrare existentă; dacă verificarea eșuează, metadatele sunt ascunse fără a elimina emailul. Importul IMAP primește o etichetă generică. Tipurile necunoscute nu mai publică metadate sau adrese arbitrare. Pentru comenzile CRM nu se inventează o rută UI: metadatele autorizate nu oferă momentan un buton de navigare. Cache-ul de rezolvare există numai pe cererea curentă.

Atașamentele sunt copii din Inbox-ul organizațional: `messaging:view` rămâne dreptul necesar. Nu devin acces la fișierul original al unei entități. Indexurile sunt normalizate unitar; valorile invalide sunt refuzate. Numele și MIME sunt validate, descărcarea e attachment, cu `nosniff` și `private, no-store`. Nu se șterg date istorice și nu se schimbă schema.

Verificări: 47 teste, 24 scenarii HTTP/recitire în JSON temporar; surse autorizate/ascunse, revocare, indexuri invalide, email anulat, descărcare reală cu nume Unicode și antete nesigure. Rezolvarea CRM/SQL este simulată în teste; fără integrare SQL live, SMTP sau Meta.
